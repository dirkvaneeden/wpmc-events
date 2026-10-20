const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const contents = fs.readFileSync(envPath, 'utf-8').replace(/^\uFEFF/, '');
  const env = {};
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  });
  return env;
}

const sql = `
-- 1. Drivers can read the events they have entered, even once an event is closed
drop policy if exists "Drivers view events they entered" on public.events;
create policy "Drivers view events they entered" on public.events for select
using (
  exists (
    select 1
    from public.event_entries en
    join public.drivers d on d.id = en.driver_id
    where en.event_id = events.id
      and d.auth_user_id = auth.uid()
  )
);

-- 2. A vehicle that has entries can no longer be deleted (it used to cascade and wipe the entries)
alter table public.event_entries drop constraint if exists event_entries_vehicle_id_fkey;
alter table public.event_entries
  add constraint event_entries_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id);
`;

async function run() {
  const env = readEnvLocal();
  if (!env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in .env.local');
    return;
  }

  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    await client.query(`notify pgrst, 'reload schema'`);
    console.log('✅ Event history access added, and vehicles with entries are now protected from deletion.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // nothing to roll back
    }
    console.error('❌ Migration failed, nothing was changed:', err.message);
  } finally {
    await client.end();
  }
}

run();