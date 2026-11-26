// Adds saved-draft support to membership applications.
// Run:  node scripts/migrate-membership-drafts.js
// Safe to re-run. Run it on the TEST project first, then on production.
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

// To target the test project instead:  node scripts/migrate-membership-drafts.js --staging
if (process.argv.includes('--staging')) {
  const file = path.join(process.cwd(), '.env.staging');
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (line.slice(0, i).trim() === 'DATABASE_URL') process.env.DATABASE_URL = val;
  }
} else {
  loadEnv();
}

const SQL = `
-- Allow the 'draft' status (finds the existing status check, whatever it is called)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'membership_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table membership_applications drop constraint %I', c.conname);
  end loop;
end $$;

alter table membership_applications
  add constraint membership_applications_status_check
  check (status in ('draft','submitted','payment_confirmed','approved','rejected'));

alter table membership_applications add column if not exists resume_token     uuid;
alter table membership_applications add column if not exists draft_payload    jsonb;
alter table membership_applications add column if not exists draft_saved_at   timestamptz;
alter table membership_applications add column if not exists draft_expires_at timestamptz;

create unique index if not exists membership_applications_resume_token_uq
  on membership_applications (resume_token) where resume_token is not null;
`;

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL).host;
  console.log('Running against: ' + host);
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(SQL);
    await client.query('commit');
    console.log('Draft support added.');
  } catch (e) {
    await client.query('rollback');
    console.error('Failed, nothing was changed:', e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
