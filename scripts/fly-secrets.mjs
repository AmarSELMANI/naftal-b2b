// Pushes the values in backend/.env to Fly as secrets.
//
// This exists because the alternative is retyping a connection string into a
// shell, and that is exactly how the local database got broken: a new URL was
// pasted after the existing `postgresql://user:` prefix, so the whole URL ended
// up inside the password field and Postgres reported "invalid port number".
// Nothing here is copied by hand, and no secret is ever printed.
//
//   node scripts/fly-secrets.mjs --cors https://your-console.pages.dev
//   node scripts/fly-secrets.mjs --cors https://… --dry-run
//
// Run it from the repository root, after `fly launch --no-deploy`.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cors = args[args.indexOf('--cors') + 1];

if (!cors || cors.startsWith('--')) {
  console.error(`
Usage: node scripts/fly-secrets.mjs --cors <origin>[,<origin>] [--dry-run]

  --cors is required. The API refuses to boot in production with an empty
  CORS_ORIGINS rather than reflecting any origin back, so there is no safe
  default to guess. Use the agent console's deployed origin, e.g.
  https://naftal-console.pages.dev — scheme included, no trailing slash.
`);
  process.exit(1);
}

const envPath = 'backend/.env';
if (!existsSync(envPath)) {
  console.error(`${envPath} not found. Run this from the repository root.`);
  process.exit(1);
}

// Same parser the server uses, so a value that works locally works here.
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const required = ['DATABASE_URL', 'DIRECT_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error('Missing from backend/.env: ' + missing.join(', '));
  process.exit(1);
}

// A production admin password must exist; the seed refuses without one. If the
// local file has none, mint one here and show it ONCE.
let generated = null;
if (!env.SEED_ADMIN_PASSWORD) {
  generated = randomBytes(12).toString('base64url');
  env.SEED_ADMIN_PASSWORD = generated;
}

const secrets = {
  DATABASE_URL: env.DATABASE_URL,
  DIRECT_URL: env.DIRECT_URL,
  JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
  SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
  CORS_ORIGINS: cors,
};

// R2 only if it is actually configured — setting empty strings would flip the
// storage driver to r2 with no credentials behind it.
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_DOCUMENTS']) {
  if (env[k]) secrets[k] = env[k];
}

// Catch the paste mistake before Fly stores it, not after a failed deploy.
for (const k of ['DATABASE_URL', 'DIRECT_URL']) {
  const v = secrets[k];
  if ((v.match(/postgresql:\/\//g) || []).length !== 1) {
    console.error(`\n${k} contains more than one "postgresql://" — a URL was pasted inside another one.\nFix backend/.env before running this.\n`);
    process.exit(1);
  }
  const pwd = v.match(/^postgresql:\/\/[^:]+:([^@]*)@/)?.[1] ?? '';
  if (/[:/]/.test(decodeURIComponent(pwd)) && !/%3A|%2F/i.test(pwd)) {
    console.error(`\n${k}: the password contains ":" or "/" unencoded. Percent-encode them (%3A, %2F).\n`);
    process.exit(1);
  }
}
if (!secrets.DATABASE_URL.includes('-pooler')) {
  console.error('\nDATABASE_URL is not the pooled endpoint (no "-pooler" in the host). Swap the two URLs.\n');
  process.exit(1);
}
if (secrets.DIRECT_URL.includes('-pooler')) {
  console.error('\nDIRECT_URL must be the DIRECT endpoint; migrations cannot run through PgBouncer.\n');
  process.exit(1);
}

console.log('Setting on Fly: ' + Object.keys(secrets).join(', '));
console.log('(values are passed directly, never printed)\n');

if (dryRun) {
  console.log('--dry-run: checks passed, nothing was sent.');
  process.exit(0);
}

const res = spawnSync(
  process.platform === 'win32' ? 'fly.exe' : 'fly',
  ['secrets', 'set', ...Object.entries(secrets).map(([k, v]) => `${k}=${v}`)],
  { stdio: 'inherit', shell: false },
);

if (res.error) {
  console.error('\nCould not run `fly`. Is flyctl installed and on PATH?');
  process.exit(1);
}
if (generated && res.status === 0) {
  console.log('\n  Generated SEED_ADMIN_PASSWORD (shown once, save it now):');
  console.log('    ' + generated + '\n');
}
process.exit(res.status ?? 1);
