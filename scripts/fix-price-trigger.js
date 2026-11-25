// Lets an update that explicitly sets price_updated_at keep that value.
// Normal edits (which do not set it) still stamp now().
// Run:  node scripts/fix-price-trigger.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SQL = `
create or replace function membership_price_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text;
begin
  v_reason := coalesce(NEW.last_change_reason, 'manual');
  if TG_OP = 'UPDATE' then
    -- Keep a timestamp that was set on purpose; otherwise stamp now().
    if NEW.price_updated_at is not distinct from OLD.price_updated_at then
      NEW.price_updated_at := now();
    end if;
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
`;

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env.local');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(SQL);
    console.log('Trigger updated.');
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
