// Copies the TABLE STRUCTURE of production into an empty staging Supabase project.
// No driver, entry or payment data is copied. Only harmless reference data is:
// entry types and the membership price list.
//
// Reads  production from .env.local   (DATABASE_URL)
// Writes staging    to   .env.staging (DATABASE_URL)
//
// Run:  node scripts/staging-copy-schema.js
//
// Safety: it only READS production. It refuses to write to a database that already
// has tables in the public schema, and it refuses to run if both URLs are the same project.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');

const REFERENCE_TABLES = ['entry_types', 'membership_years', 'membership_prices'];

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

const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

function describe(url) {
  const u = new URL(url);
  return { host: u.host, user: decodeURIComponent(u.username) };
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const SRC = parseEnv('.env.local').DATABASE_URL;
  const DST = parseEnv('.env.staging').DATABASE_URL;
  if (!SRC) throw new Error('DATABASE_URL (production) is missing in .env.local');
  if (!DST) throw new Error('DATABASE_URL (staging) is missing in .env.staging');

  const s = describe(SRC);
  const d = describe(DST);
  if (SRC === DST || s.user === d.user) {
    throw new Error('Production and staging point at the same project. Stopping.');
  }

  console.log('\nREAD  from (production): ' + s.user + ' @ ' + s.host);
  console.log('WRITE to   (staging):    ' + d.user + ' @ ' + d.host + '\n');
  const answer = await ask('Is the WRITE line your empty TEST project? Type yes to continue: ');
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  const src = new Client({ connectionString: SRC, ssl: { rejectUnauthorized: false } });
  const dst = new Client({ connectionString: DST, ssl: { rejectUnauthorized: false } });
  await src.connect();
  await dst.connect();

  try {
    const existing = await dst.query(
      "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')"
    );
    if (existing.rows[0].n > 0) {
      throw new Error('The target already has tables in the public schema. Use an empty project.');
    }

    // ---- Read the structure from production ----
    const enums = (
      await src.query(`
        select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_type t join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' group by t.typname order by t.typname`)
    ).rows;

    const tables = (
      await src.query(`
        select c.oid, c.relname, c.relrowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p') and not c.relispartition
        order by c.relname`)
    ).rows;

    const columns = {};
    for (const t of tables) {
      columns[t.relname] = (
        await src.query(
          `select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull,
                  a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) as def
           from pg_attribute a
           left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
           order by a.attnum`,
          [t.oid]
        )
      ).rows;
    }

    const constraints = (
      await src.query(`
        select k.conname, k.contype, pg_get_constraintdef(k.oid) as def,
               (select relname from pg_class where oid = k.conrelid) as rel
        from pg_constraint k
        where k.connamespace = 'public'::regnamespace and k.conrelid <> 0
        order by case k.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 when 'x' then 4 else 5 end, k.conname`)
    ).rows;

    const indexes = (
      await src.query(`
        select pg_get_indexdef(i.indexrelid) as def
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)`)
    ).rows;

    const functions = (
      await src.query(`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind in ('f','p')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by p.proname`)
    ).rows;

    const functionAcls = (
      await src.query(`
        select p.oid::regprocedure::text as sig,
               coalesce((select array_agg(case when a.grantee = 0 then 'public'
                                               else (select rolname from pg_roles where oid = a.grantee) end)
                         from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), '{}')::text[] as grantees
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind in ('f','p') and p.proacl is not null
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
    ).rows;

    const views = (
      await src.query("select viewname, definition from pg_views where schemaname = 'public' order by viewname")
    ).rows;

    const triggers = (
      await src.query(`
        select pg_get_triggerdef(t.oid) as def
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal`)
    ).rows;

    const policies = (
      await src.query(`
        select schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
        from pg_policies
        where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
        order by schemaname, tablename, policyname`)
    ).rows;

    const buckets = (
      await src.query('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets')
    ).rows;

    // ---- Write to staging ----
    console.log('\nBuilding the staging structure...');
    await dst.query('begin');
    await dst.query('set local check_function_bodies = off');

    for (const e of enums) {
      const labels = e.labels.map((l) => "'" + l.replace(/'/g, "''") + "'").join(', ');
      await dst.query(`create type public.${qi(e.typname)} as enum (${labels})`);
    }

    for (const t of tables) {
      const cols = columns[t.relname].map((c) => {
        let line = `${qi(c.attname)} ${c.type}`;
        if (c.attgenerated === 's') line += ` generated always as (${c.def}) stored`;
        else if (c.attidentity === 'a') line += ' generated always as identity';
        else if (c.attidentity === 'd') line += ' generated by default as identity';
        else if (c.def) {
          if (/nextval\(/i.test(c.def)) console.warn(`  Warning: ${t.relname}.${c.attname} uses a sequence (${c.def}).`);
          line += ` default ${c.def}`;
        }
        if (c.attnotnull) line += ' not null';
        return line;
      });
      await dst.query(`create table public.${qi(t.relname)} (\n  ${cols.join(',\n  ')}\n)`);
    }

    for (const k of constraints) {
      await dst.query(`alter table public.${qi(k.rel)} add constraint ${qi(k.conname)} ${k.def}`);
    }
    for (const i of indexes) await dst.query(i.def);
    for (const f of functions) await dst.query(f.def);
    for (const v of views) await dst.query(`create view public.${qi(v.viewname)} as ${v.definition}`);
    for (const t of triggers) await dst.query(t.def);

    for (const t of tables) {
      if (t.relrowsecurity) await dst.query(`alter table public.${qi(t.relname)} enable row level security`);
    }

    for (const a of functionAcls) {
      await dst.query(`revoke all on function ${a.sig} from public, anon, authenticated`);
      const grantees = a.grantees.map((g) => (g === 'public' ? 'public' : qi(g)));
      if (grantees.length) await dst.query(`grant execute on function ${a.sig} to ${grantees.join(', ')}`);
    }

    const publicPolicies = policies.filter((p) => p.schemaname === 'public');
    for (const p of publicPolicies) await dst.query(policySql(p));
    await dst.query('commit');
    console.log(`  ${tables.length} tables, ${functions.length} functions, ${publicPolicies.length} policies created.`);

    // ---- Storage (separate, best effort) ----
    for (const b of buckets) {
      try {
        await dst.query(
          `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
           values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
          [b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types]
        );
        console.log('  Bucket created: ' + b.id + (b.public ? ' (public)' : ' (private)'));
      } catch (e) {
        console.warn(`  Could not create bucket ${b.id}: ${e.message}. Create it in the dashboard.`);
      }
    }
    for (const p of policies.filter((x) => x.schemaname === 'storage')) {
      try {
        await dst.query(policySql(p));
        console.log('  Storage policy created: ' + p.policyname);
      } catch (e) {
        console.warn(`  Could not create storage policy "${p.policyname}": ${e.message}`);
      }
    }

    // ---- Reference data only ----
    for (const name of REFERENCE_TABLES) {
      if (!tables.some((t) => t.relname === name)) continue;
      try {
        const { rows } = await src.query(`select * from public.${qi(name)}`);
        if (!rows.length) continue;
        await dst.query(
          `insert into public.${qi(name)} select * from json_populate_recordset(null::public.${qi(name)}, $1::json)`,
          [JSON.stringify(rows)]
        );
        console.log(`  Copied ${rows.length} reference rows into ${name}.`);
      } catch (e) {
        console.warn(`  Could not copy ${name}: ${e.message}`);
      }
    }

    console.log('\nDone. Next: run  node scripts/staging-create-admin.js  to create your first test admin.');
  } catch (e) {
    try {
      await dst.query('rollback');
    } catch {}
    console.error('\nFailed, nothing was kept in the staging structure:', e.message);
    process.exitCode = 1;
  } finally {
    await src.end();
    await dst.end();
  }
}

function policySql(p) {
  const roles = (p.roles || []).map((r) => (r === 'public' ? 'public' : qi(r))).join(', ');
  let sql = `create policy ${qi(p.policyname)} on ${qi(p.schemaname)}.${qi(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles || 'public'}`;
  if (p.qual) sql += ` using (${p.qual})`;
  if (p.with_check) sql += ` with check (${p.with_check})`;
  return sql;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
