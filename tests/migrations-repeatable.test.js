import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const LEGACY = join(process.cwd(), 'supabase', 'legacy');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const read = (dir, name) => readFileSync(join(dir, name), 'utf8');

const migrations = files.map((name) => ({ name, sql: read(MIGRATIONS, name) }));

// ---------- repeatability ----------
// A migration that aborts halfway leaves the database in a half-applied state, and a retry then
// fails on the object that already exists. Every object-creating statement must therefore be
// guarded, so `supabase db reset` and a retried `db push` converge on the same schema.
test('every create policy in every migration is preceded by a drop policy if exists', () => {
  const offenders = [];
  for (const { name, sql } of migrations) {
    const lines = sql.split('\n');
    lines.forEach((line, index) => {
      if (!/^\s*create\s+policy\b/i.test(line)) return;
      // The drop may sit further back because policy bodies span several lines.
      const window = lines.slice(Math.max(0, index - 24), index + 3).join('\n').toLowerCase();
      if (!window.includes('drop policy if exists')) {
        offenders.push(`${name}:${index + 1} ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `unguarded create policy statements:\n${offenders.join('\n')}`);
});

test('every create table in every migration is guarded with if not exists', () => {
  const offenders = [];
  for (const { name, sql } of migrations) {
    sql.split('\n').forEach((line, index) => {
      if (/^\s*create\s+table\s+(?!if\s+not\s+exists)/i.test(line)) {
        offenders.push(`${name}:${index + 1} ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `unguarded create table statements:\n${offenders.join('\n')}`);
});

test('every security definer function pins its search_path', () => {
  const offenders = [];
  for (const { name, sql } of migrations) {
    const blocks = sql.split(/create or replace function/i).slice(1);
    blocks.forEach((block) => {
      const head = block.slice(0, 400).toLowerCase();
      if (!head.includes('security definer')) return;
      if (!head.includes('set search_path')) offenders.push(`${name}: ${block.slice(0, 60).trim().split('\n')[0]}`);
    });
  }
  assert.deepEqual(offenders, [], `security definer functions without a pinned search_path:\n${offenders.join('\n')}`);
});

// ---------- the duplicate "fix" migration ----------
// The audit asserted this migration was a byte-identical no-op. That is now asserted, so the
// file cannot be edited into a real change without the suite noticing.
test('20260921020000 is confirmed equivalent to the canonical function it claims to fix', () => {
  const canonical = migrations.find((m) => m.name.startsWith('20260920000000')).sql;
  const fix = migrations.find((m) => m.name.startsWith('20260921020000')).sql;

  const bodyOf = (text) => {
    const start = text.indexOf('create or replace function public.sync_workout_graph(');
    assert.notEqual(start, -1, 'sync_workout_graph must be defined');
    const end = text.indexOf('$$;', start);
    return text.slice(start, end === -1 ? undefined : end + 3).replace(/\s+/g, ' ').trim();
  };

  const a = bodyOf(canonical);
  const b = bodyOf(fix);
  assert.equal(a.length, b.length, 'the two definitions must be the same size');
  assert.equal(a, b, '20260921020000 redefines an identical function and is a no-op');
});

test('no migration grants privileges to anon or public', () => {
  const offenders = [];
  for (const { name, sql } of migrations) {
    const pattern = /grant\s+[^;]*\bto\s+(anon|public)\b/gi;
    let match;
    while ((match = pattern.exec(sql)) !== null) offenders.push(`${name}: ${match[0].trim()}`);
  }
  assert.deepEqual(offenders, [], `privilege grants to anon/public:\n${offenders.join('\n')}`);
});

// ---------- obsolete scripts must be inert ----------
test('every legacy script aborts if executed', () => {
  const legacyFiles = readdirSync(LEGACY).filter((f) => f.endsWith('.sql'));
  assert.ok(legacyFiles.length > 0, 'legacy folder should still exist for reference');
  for (const name of legacyFiles) {
    const sql = read(LEGACY, name);
    assert.match(
      sql,
      /raise\s+exception[\s\S]{0,400}superseded/i,
      `supabase/legacy/${name} must raise on execution so it cannot be pasted into production`,
    );
  }
});

test('legacy scripts cannot define a security definer function without search_path', () => {
  // The guard is prepended, so anything after it is unreachable; this guards against someone
  // removing the guard in a later "cleanup".
  for (const name of readdirSync(LEGACY).filter((f) => f.endsWith('.sql'))) {
    const sql = read(LEGACY, name);
    const guardIndex = sql.indexOf('This script is superseded by');
    const guarded = guardIndex !== -1 && sql.indexOf('RAISE EXCEPTION') < sql.length;
    assert.ok(guarded, `supabase/legacy/${name} lost its execution guard`);
  }
});
