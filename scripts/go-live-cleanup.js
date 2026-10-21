const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'entry-documents';
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const DELETE_EVENTS = args.includes('--delete-events');

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

function randomPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function listAuthUsers(supabase) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function listAllFiles(supabase, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAllFiles(supabase, full)));
      else files.push(full);
    }
    if (data.length < 100) break;
  }
  return files;
}

async function run() {
  const env = readEnvLocal();
  const missing = ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error('Missing in .env.local:', missing.join(', '));
    return;
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    const flagColumn = await db.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'admin_users' and column_name = 'must_change_password'`
    );
    if (flagColumn.rowCount === 0) {
      console.error('Stopping: run scripts/go-live-prepare.js first (it adds the must_change_password column).');
      return;
    }

    const admins = (await db.query('select id, auth_user_id, email, full_name from public.admin_users order by id'))
      .rows;
    if (admins.length === 0) {
      console.error('Stopping: no admin users were found, so everything would be deleted.');
      return;
    }
    const adminAuthIds = new Set(admins.map((a) => a.auth_user_id).filter(Boolean));

    const count = async (table) => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
    const counts = {
      payments: await count('public.payments'),
      entries: await count('public.event_entries'),
      vehicles: await count('public.vehicles'),
      drivers: await count('public.drivers'),
      events: await count('public.events'),
      classes: await count('public.race_classes'),
      subclasses: await count('public.race_subclasses'),
      fees: await count('public."entryFee"'),
      bank: await count('public.bank_details'),
    };

    const authUsers = await listAuthUsers(supabase);
    const toDelete = authUsers.filter((u) => !adminAuthIds.has(u.id));
    const files = await listAllFiles(supabase, '');

    console.log('\nWHAT WILL HAPPEN' + (CONFIRM ? '' : '  (dry run, nothing is changed)'));
    console.log('--------------------------------------------');
    console.log(`Delete  ${counts.entries} entries (and ${counts.payments} payments)`);
    console.log(`Delete  ${counts.vehicles} vehicles`);
    console.log(`Delete  ${counts.drivers} driver profiles`);
    console.log(`Delete  ${toDelete.length} login accounts that are not admins`);
    console.log(`Delete  ${files.length} uploaded files`);
    if (DELETE_EVENTS) {
      console.log(
        `Delete  ${counts.events} events with ${counts.classes} classes, ${counts.subclasses} sub classes, ${counts.fees} fees, ${counts.bank} bank detail records`
      );
    } else {
      console.log(
        `Keep    ${counts.events} events with ${counts.classes} classes, ${counts.subclasses} sub classes, ${counts.fees} fees, ${counts.bank} bank detail records`
      );
    }
    console.log(`Keep    ${admins.length} admin accounts (new temporary passwords, forced change at next login):`);
    admins.forEach((a) => console.log(`          - ${a.email}`));
    if (toDelete.length > 0) {
      console.log('\nLogin accounts to be deleted (first 10):');
      toDelete.slice(0, 10).forEach((u) => console.log(`          - ${u.email ?? u.phone ?? u.id}`));
    }

    if (!CONFIRM) {
      console.log('\nNothing was changed. To run it for real, add --confirm.');
      return;
    }

    const answer = await ask('\nThis cannot be undone. Type DELETE to continue: ');
    if (answer !== 'DELETE') {
      console.log('Cancelled. Nothing was changed.');
      return;
    }

    // 1. Database rows, all or nothing
    try {
      await db.query('BEGIN');
      await db.query('delete from public.payments');
      await db.query('delete from public.event_entries');
      await db.query('delete from public.vehicles');
      await db.query('delete from public.drivers');
      if (DELETE_EVENTS) await db.query('delete from public.events');
      await db.query('COMMIT');
      console.log('✅ Database rows deleted.');
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('❌ Database delete failed, nothing was changed:', err.message);
      return;
    }

    // 2. Login accounts
    let deleted = 0;
    for (const u of toDelete) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) console.error(`   could not delete ${u.email ?? u.id}: ${error.message}`);
      else deleted++;
    }
    console.log(`✅ ${deleted} of ${toDelete.length} login accounts deleted.`);

    // 3. Uploaded files
    let removed = 0;
    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) console.error(`   file delete failed: ${error.message}`);
      else removed += batch.length;
    }
    console.log(`✅ ${removed} of ${files.length} files deleted.`);

    // 4. Admin passwords
    const credentials = [];
    for (const a of admins) {
      if (!a.auth_user_id) {
        console.warn(`   ${a.email} has no login account linked, skipped.`);
        continue;
      }
      const password = randomPassword();
      const { error } = await supabase.auth.admin.updateUserById(a.auth_user_id, { password });
      if (error) {
        console.error(`   could not reset ${a.email}: ${error.message}`);
        continue;
      }
      await db.query('update public.admin_users set must_change_password = true where id = $1', [a.id]);
      credentials.push({ email: a.email, 'temporary password': password });
    }

    console.log('\nTEMPORARY ADMIN PASSWORDS (shown once, copy them now):');
    console.table(credentials);
    console.log('Each admin must choose a new password at their next login.');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    await db.end();
  }
}

run();