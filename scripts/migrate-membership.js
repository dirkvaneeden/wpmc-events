// Membership migration: price lists, price history, applications, member numbers.
// Run:  node scripts/migrate-membership.js
// Safe to re-run (idempotent).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SQL = `
-- ===== Tables =====
create table if not exists membership_years (
  year            int primary key,
  last_member_no  int not null default 0,          -- last number used; next = +1
  reduction_pct   numeric(5,2) not null default 25,
  rounding_mode   text not null default 'decimals'
                  check (rounding_mode in ('up','down','decimals')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists membership_prices (
  id                 uuid primary key default gen_random_uuid(),
  year               int not null references membership_years(year) on delete cascade,
  category_key       text not null,
  label              text not null,
  note               text,
  price_group        text not null default 'membership'
                     check (price_group in ('membership','lounge')),
  price              numeric(10,2) not null check (price >= 0),
  sort_order         int not null default 0,
  active             boolean not null default true,
  price_updated_at   timestamptz not null default now(),   -- drives the 3-month clock
  last_change_reason text default 'created',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (year, category_key)
);

create table if not exists membership_price_history (
  id           uuid primary key default gen_random_uuid(),
  price_id     uuid not null,
  year         int not null,
  label        text not null,
  old_price    numeric(10,2),
  new_price    numeric(10,2) not null,
  reason       text not null
               check (reason in ('created','manual','proposal_accepted','proposal_rejected','copied')),
  changed_by   text,
  changed_at   timestamptz not null default now()
);
create index if not exists membership_price_history_price_idx
  on membership_price_history (price_id, changed_at desc);

create table if not exists membership_applications (
  id                    uuid primary key default gen_random_uuid(),
  year                  int not null references membership_years(year),
  application_type      text not null check (application_type in ('new','renew')),
  status                text not null default 'submitted'
                        check (status in ('submitted','payment_confirmed','approved','rejected')),
  -- main member
  surname               text not null,
  first_name            text not null,
  id_number             text,
  email                 text not null,
  mobile                text,
  tel_home              text,
  tel_work              text,
  fax                   text,
  employer              text,
  occupation            text,
  postal_address        text,
  physical_address      text,
  -- category and add-on (snapshots so later price changes never alter an application)
  category_id           uuid,
  category_label        text,
  category_price        numeric(10,2),
  lounge_id             uuid,
  lounge_label          text,
  lounge_price          numeric(10,2),
  total_due             numeric(10,2) not null default 0,
  -- partner / junior members: [{role,name,id_no,email,cell}]
  partners              jsonb not null default '[]'::jsonb,
  sections              text[] not null default '{}',
  -- consents and waiver
  consent_email         boolean not null default false,
  consent_mobile        boolean not null default false,
  consent_newsletter    boolean not null default false,
  waiver_accepted       boolean not null default false,
  waiver_name           text,
  waiver_accepted_at    timestamptz,
  emergency_name        text,
  emergency_phone       text,
  guardian_name         text,
  -- payment
  pop_url               text,
  payment_confirmed_at  timestamptz,
  payment_confirmed_by  text,
  -- renewal matching (email only) and flagging
  renew_matched         boolean,
  flagged               boolean not null default false,
  flag_reason           text,
  -- approval
  member_no             text,
  approved_at           timestamptz,
  approved_by           text,
  admin_notes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists membership_applications_email_idx
  on membership_applications (lower(email));
create index if not exists membership_applications_status_idx
  on membership_applications (status, created_at desc);
create unique index if not exists membership_applications_member_no_uq
  on membership_applications (member_no) where member_no is not null;

-- ===== Helpers =====
create or replace function round_price(p_value numeric, p_mode text)
returns numeric language sql immutable as $$
  select case p_mode
    when 'up'   then ceil(p_value)
    when 'down' then floor(p_value)
    else round(p_value, 2)
  end;
$$;

-- Every insert/update stamps the timestamps and writes a history row.
create or replace function membership_price_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text;
begin
  v_reason := coalesce(NEW.last_change_reason, 'manual');
  if TG_OP = 'UPDATE' then
    NEW.price_updated_at := now();
    NEW.updated_at := now();
  end if;
  insert into membership_price_history
    (price_id, year, label, old_price, new_price, reason, changed_by)
  values
    (NEW.id, NEW.year, NEW.label,
     case when TG_OP = 'UPDATE' then OLD.price else null end,
     NEW.price, v_reason,
     coalesce(auth.jwt() ->> 'email', 'system'));
  NEW.last_change_reason := null;
  return NEW;
end;
$$;

drop trigger if exists trg_membership_price_audit on membership_prices;
create trigger trg_membership_price_audit
  before insert or update on membership_prices
  for each row execute function membership_price_audit();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end;
$$;

drop trigger if exists trg_membership_years_touch on membership_years;
create trigger trg_membership_years_touch before update on membership_years
  for each row execute function touch_updated_at();

drop trigger if exists trg_membership_apps_touch on membership_applications;
create trigger trg_membership_apps_touch before update on membership_applications
  for each row execute function touch_updated_at();

-- ===== Admin functions =====
-- Accept a proposed reduction (uses the year's percentage unless one is passed).
create or replace function apply_price_reduction(p_price_id uuid, p_pct numeric, p_rounding text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_new numeric;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update membership_prices
     set price = round_price(price * (1 - p_pct / 100.0), p_rounding),
         last_change_reason = 'proposal_accepted'
   where id = p_price_id
   returning price into v_new;
  return v_new;
end;
$$;

-- Reject a proposal: price stays, clock restarts, rejection is logged.
create or replace function reject_price_reduction(p_price_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update membership_prices set last_change_reason = 'proposal_rejected' where id = p_price_id;
end;
$$;

-- Copy a year's price list to a new year with a % increase.
create or replace function copy_price_list(p_from int, p_to int, p_pct numeric, p_rounding text)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from membership_years where year = p_to) then
    raise exception 'Price list for % already exists', p_to;
  end if;
  insert into membership_years (year, reduction_pct, rounding_mode)
    select p_to, reduction_pct, rounding_mode from membership_years where year = p_from;
  insert into membership_prices
    (year, category_key, label, note, price_group, price, sort_order, active, last_change_reason)
    select p_to, category_key, label, note, price_group,
           round_price(price * (1 + p_pct / 100.0), p_rounding),
           sort_order, active, 'copied'
      from membership_prices where year = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Next member number for a year, e.g. 26/52311 (does not reserve it).
create or replace function propose_member_no(p_year int)
returns text language plpgsql security definer set search_path = public as $$
declare v_last int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select last_member_no into v_last from membership_years where year = p_year;
  if v_last is null then raise exception 'No price list for %', p_year; end if;
  return lpad((p_year % 100)::text, 2, '0') || '/' || lpad((v_last + 1)::text, 5, '0');
end;
$$;

-- Approve once payment is confirmed. Admin may overwrite the proposed number.
create or replace function approve_membership(p_app_id uuid, p_member_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_app membership_applications%rowtype;
  v_seq int;
  v_prefix int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into v_app from membership_applications where id = p_app_id for update;
  if not found then raise exception 'Application not found'; end if;
  if v_app.payment_confirmed_at is null then
    raise exception 'Confirm payment before approving';
  end if;
  if p_member_no !~ '^[0-9]{2}/[0-9]{5}$' then
    raise exception 'Member number must look like 26/52311';
  end if;
  if exists (select 1 from membership_applications
              where member_no = p_member_no and id <> p_app_id) then
    raise exception 'Member number % is already in use', p_member_no;
  end if;
  update membership_applications
     set status = 'approved', member_no = p_member_no,
         approved_at = now(), approved_by = coalesce(auth.jwt() ->> 'email', 'admin')
   where id = p_app_id;
  v_prefix := split_part(p_member_no, '/', 1)::int;
  v_seq    := split_part(p_member_no, '/', 2)::int;
  if v_prefix = v_app.year % 100 then
    update membership_years set last_member_no = greatest(last_member_no, v_seq)
     where year = v_app.year;
  end if;
end;
$$;

revoke all on function apply_price_reduction(uuid, numeric, text) from public, anon;
revoke all on function reject_price_reduction(uuid) from public, anon;
revoke all on function copy_price_list(int, int, numeric, text) from public, anon;
revoke all on function propose_member_no(int) from public, anon;
revoke all on function approve_membership(uuid, text) from public, anon;
grant execute on function apply_price_reduction(uuid, numeric, text) to authenticated;
grant execute on function reject_price_reduction(uuid) to authenticated;
grant execute on function copy_price_list(int, int, numeric, text) to authenticated;
grant execute on function propose_member_no(int) to authenticated;
grant execute on function approve_membership(uuid, text) to authenticated;

-- ===== RLS =====
alter table membership_years          enable row level security;
alter table membership_prices         enable row level security;
alter table membership_price_history  enable row level security;
alter table membership_applications   enable row level security;

drop policy if exists years_read    on membership_years;
drop policy if exists years_admin   on membership_years;
drop policy if exists prices_read   on membership_prices;
drop policy if exists prices_admin  on membership_prices;
drop policy if exists history_admin on membership_price_history;
drop policy if exists apps_admin    on membership_applications;

create policy years_read   on membership_years  for select to anon, authenticated using (true);
create policy years_admin  on membership_years  for all to authenticated
  using (is_admin()) with check (is_admin());
create policy prices_read  on membership_prices for select to anon, authenticated
  using (active = true);
create policy prices_admin on membership_prices for all to authenticated
  using (is_admin()) with check (is_admin());
create policy history_admin on membership_price_history for select to authenticated
  using (is_admin());
-- Applications: admins only. Public submissions go through a server route (service role).
create policy apps_admin on membership_applications for all to authenticated
  using (is_admin()) with check (is_admin());

-- ===== Seed 2026 =====
insert into membership_years (year) values (2026) on conflict (year) do nothing;

insert into membership_prices (year, category_key, label, note, price_group, price, sort_order)
values
 (2026,'adult','Adult Member',null,'membership',1310,10),
 (2026,'member_partner','Member + Partner*','Partner is a spouse or common-law partner only','membership',2110,20),
 (2026,'pensioner','Pensioner (Over 63)',null,'membership',875,30),
 (2026,'pensioner_partner','Pensioner + Partner*','Partner is a spouse or common-law partner only','membership',1355,40),
 (2026,'country','Country Member (+300km)',null,'membership',875,50),
 (2026,'country_partner','Country Member + Partner*','Partner is a spouse or common-law partner only','membership',1355,60),
 (2026,'student_u25','Full Time Student (Under 25)','Student card must be shown','membership',885,70),
 (2026,'student_u18','Full Time Student (Under 18)','Student card must be shown','membership',805,80),
 (2026,'under_12','Under 12',null,'membership',190,90),
 (2026,'replacement_book','Replacement Book',null,'membership',170,100),
 (2026,'lounge_only_1','Pheiffer Lounge ONLY - Admit 1','Access to the Pheiffer Lounge area for 16 events','lounge',6400,110),
 (2026,'lounge_admit_2','Pheiffer Lounge - Admit 2','Access to the Pheiffer Lounge area for 16 events','lounge',11520,120),
 (2026,'lounge_pensioner_1','Pheiffer Lounge - Pensioner Over 63 - Admit 1','Access to the Pheiffer Lounge area for 16 events','lounge',5760,130),
 (2026,'lounge_pensioner_plus1','Pheiffer Lounge - Pensioner plus 1 other','Access to the Pheiffer Lounge area for 16 events','lounge',10360,140)
on conflict (year, category_key) do nothing;
`;

const STORAGE_SQL = `
insert into storage.buckets (id, name, public)
values ('membership-documents', 'membership-documents', false)
on conflict (id) do nothing;
`;

const STORAGE_POLICY_SQL = `
drop policy if exists membership_docs_admin_read on storage.objects;
create policy membership_docs_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'membership-documents' and is_admin());
`;

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env.local (use the Session pooler string).');
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(SQL);
    await client.query('commit');
    console.log('Membership tables, functions, policies and 2026 prices ready.');
  } catch (e) {
    await client.query('rollback');
    console.error('Migration failed, nothing was changed:', e.message);
    await client.end();
    process.exit(1);
  }
  for (const [name, sql] of [['storage bucket', STORAGE_SQL], ['storage policy', STORAGE_POLICY_SQL]]) {
    try {
      await client.query(sql);
      console.log('OK: ' + name);
    } catch (e) {
      console.warn('Could not create ' + name + ' (' + e.message + ').');
      console.warn('Create a PRIVATE bucket named membership-documents in the Supabase dashboard instead.');
    }
  }
  await client.end();
})();