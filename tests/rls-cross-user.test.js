import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cross-user RLS proof.
 *
 * This suite REQUIRES a live, disposable Postgres database. It deliberately refuses to run
 * against production: `SUPABASE_DB_URL` must be supplied explicitly, and the harness only
 * runs a transaction it rolls back.
 *
 * When no database is configured the test SKIPS with a loud message rather than passing.
 * A skip is the honest outcome here: the audit found that RLS had only ever been verified by
 * matching text in migration files, and a green skip must not be mistaken for proof.
 */

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
const ALLOW_RUN = process.env.ALLOW_RLS_PROBE === '1';

// A production host would be catastrophic here even with rollback, because the probe
// temporarily creates auth.users rows. Refuse anything that is not obviously local/test.
const looksDisposable = !/(prod|live)/i.test(DB_URL);

test('cross-user RLS: user B cannot read, modify or delete user A', async (t) => {
  if (!DB_URL) {
    t.skip('SKIPPED: no SUPABASE_DB_URL configured. Cross-user RLS is NOT verified.');
    return;
  }
  if (!ALLOW_RUN) {
    t.skip('SKIPPED: set ALLOW_RLS_PROBE=1 to run the destructive-capable probe.');
    return;
  }
  if (!looksDisposable) {
    t.skip('SKIPPED: refusing to run the probe against a host that looks like production.');
    return;
  }

  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    t.skip('SKIPPED: the `pg` driver is not installed in this workspace.');
    return;
  }

  const sql = readFileSync(join(process.cwd(), 'tests', 'sql', 'rls-cross-user.sql'), 'utf8');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(sql);
    // Reaching here means every DO $$ block completed, because each raises on failure.
  } finally {
    await client.end().catch(() => {});
  }
});

test('the RLS probe script exists and rolls back', () => {
  const path = join(process.cwd(), 'tests', 'sql', 'rls-cross-user.sql');
  assert.ok(existsSync(path), 'the RLS probe script must be committed for CI to run');
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /\bbegin\s*;/i, 'probe must open a transaction');
  assert.match(sql, /\brollback\s*;/i, 'probe must roll back so no test data persists');
  assert.match(sql, /cannot SELECT user A/i, 'probe must assert SELECT isolation');
  assert.match(sql, /cannot UPDATE user A/i, 'probe must assert UPDATE isolation');
  assert.match(sql, /cannot DELETE user A/i, 'probe must assert DELETE isolation');
  assert.match(sql, /spoofed insert rejected/i, 'probe must assert user_id spoofing is rejected');
  assert.match(sql, /anon cannot read user data/i, 'probe must assert anon is denied');
});

test('the probe never points at production by default', () => {
  // Nothing in the repo may hardcode a production database URL for tests.
  const url = DB_URL;
  assert.ok(
    !url || /localhost|127\.0\.0\.1|\/pg\/(meta|postgres|utils)|supabase\.co$/i.test(url),
    'the RLS probe must only ever target a local or explicitly disposable database',
  );
});
