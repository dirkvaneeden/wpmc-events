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

    await client.query(
      `alter table public.admin_users add column if not exists must_change_password boolean not null default false`
    );

    // Remove every existing rule that mentions the documents bucket (the temporary open one)
    const existing = await client.query(`
      select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') like '%entry-documents%' or coalesce(with_check, '') like '%entry-documents%')
    `);
    for (const row of existing.rows) {
      await client.query(`drop policy if exists "${row.policyname.replace(/"/g, '""')}" on storage.objects`);
    }

    await client.query(`
      create policy "Drivers upload own documents" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'entry-documents'
        and (storage.foldername(name))[1] in ('msa-licenses', 'pop-driver')
        and exists (
          select 1 from public.drivers d
          where d.auth_user_id = auth.uid()
            and storage.filename(name) like d.id::text || '-%'
        )
      )
    `);

    await client.query(`
      create policy "Admins manage entry documents" on storage.objects for all to authenticated
      using (bucket_id = 'entry-documents' and public.is_admin())
      with check (bucket_id = 'entry-documents' and public.is_admin())
    `);

    await client.query('COMMIT');
    console.log(`✅ Done. Replaced ${existing.rows.length} old document rule(s) and added the admin flag.`);

    const noRls = await client.query(
      `select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename`
    );
    if (noRls.rows.length > 0) {
      console.log('⚠️  These tables still have row level security OFF:', noRls.rows.map((r) => r.tablename).join(', '));
    } else {
      console.log('✅ Every public table has row level security on.');
    }

    try {
      const bucket = await client.query(`select public from storage.buckets where id = 'entry-documents'`);
      if (bucket.rows[0]?.public) {
        console.log('⚠️  The entry-documents bucket is PUBLIC. Set it to private in the Supabase Storage settings.');
      } else {
        console.log('✅ The entry-documents bucket is private.');
      }
    } catch {
      console.log('Could not check whether the bucket is private. Check it in the Storage settings.');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // nothing to roll back
    }
    console.error('❌ Failed, nothing was changed:', err.message);
  } finally {
    await client.end();
  }
}

run();