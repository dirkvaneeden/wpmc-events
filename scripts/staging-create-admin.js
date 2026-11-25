// Creates the first admin user in the STAGING project (reads .env.staging).
// Run:  node scripts/staging-create-admin.js you@example.com "StrongPassword1" "Your Name"
//
// Refuses to run if .env.staging points at the same Supabase project as .env.local.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function parseEnv(file) {
  const full = path.join(process.cwd(), file);
  const out = {};
  if (!fs.existsSync(full)) return out;
  const text = fs.readFileSync(full, 'utf8').replace(/^﻿/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

(async () => {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password || !fullName) {
    console.error('Usage: node scripts/staging-create-admin.js <email> <password> "<full name>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const prod = parseEnv('.env.local');
  const stg = parseEnv('.env.staging');
  const url = stg.NEXT_PUBLIC_SUPABASE_URL;
  const key = stg.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.staging');
    process.exit(1);
  }
  if (url === prod.NEXT_PUBLIC_SUPABASE_URL || key === prod.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env.staging points at the production project. Stopping.');
    process.exit(1);
  }

  console.log('Creating admin in: ' + url);
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    console.error('Could not create the user:', error ? error.message : 'unknown error');
    process.exit(1);
  }

  const { error: insertError } = await db.from('admin_users').insert({
    auth_user_id: data.user.id,
    full_name: fullName,
    email,
    must_change_password: false,
  });
  if (insertError) {
    console.error('User created, but the admin record failed:', insertError.message);
    process.exit(1);
  }
  console.log('Done. Log in at /admin/login on the staging site with ' + email);
})();
