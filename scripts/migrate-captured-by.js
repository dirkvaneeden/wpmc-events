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
alter table public.event_entries
  add column if not exists captured_by bigint references public.admin_users(id) on delete set null;

create index if not exists event_entries_captured_by_idx on public.event_entries (captured_by);

-- Drivers can still insert their own entries, but only admins can record a "captured by"
drop policy if exists "Insert own entries" on public.event_entries;
create policy "Insert own entries" on public.event_entries for insert
with check (
  is_admin()
  or (
    captured_by is null
    and driver_id in (select id from public.drivers where auth_user_id = auth.uid())
  )
);
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
    console.log('✅ event_entries.captured_by added and the insert policy updated.');
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