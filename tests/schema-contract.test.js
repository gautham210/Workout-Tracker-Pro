import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260920000000_canonical_schema_and_sync.sql', import.meta.url), 'utf8');
const rateLimitMigration = readFileSync(new URL('../supabase/migrations/20260921010000_distributed_api_rate_limits.sql', import.meta.url), 'utf8');
const uuidFixMigration = readFileSync(new URL('../supabase/migrations/20260921020000_fix_sync_graph_uuid_children.sql', import.meta.url), 'utf8');

test('canonical migration owns every user data path and uses server identity', () => {
  for (const table of ['profiles', 'workout_sessions', 'session_exercises', 'sets', 'bodyweight_logs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /session_exercises_own_all/);
  assert.match(migration, /sets_own_all/);
});

test('completed workout graph is atomically ordered and validates records', () => {
  assert.match(migration, /create or replace function public\.sync_workout_graph\(p_workout jsonb\)/);
  assert.match(migration, /insert into public\.workout_sessions/);
  assert.match(migration, /insert into public\.session_exercises/);
  assert.match(migration, /insert into public\.sets/);
  assert.match(migration, /only completed workouts may be synced/);
  assert.match(migration, /workout does not belong to current user/);
  assert.match(uuidFixMigration, /se\.id = v_session_exercise_id::uuid/);
  assert.match(uuidFixMigration, /s\.id = v_set_id::uuid/);
  assert.match(uuidFixMigration, /values \(v_set_id::uuid, v_session_exercise_id::uuid/);
});

test('shared API quota derives ownership from auth and is not publicly accessible', () => {
  assert.match(rateLimitMigration, /create table if not exists public\.api_rate_limits/);
  assert.match(rateLimitMigration, /references auth\.users\(id\) on delete cascade/);
  assert.match(rateLimitMigration, /alter table public\.api_rate_limits enable row level security/);
  assert.match(rateLimitMigration, /v_user uuid := auth\.uid\(\)/);
  assert.match(rateLimitMigration, /revoke all on function public\.consume_api_rate_limit\(text\) from public, anon/);
  assert.match(rateLimitMigration, /grant execute on function public\.consume_api_rate_limit\(text\) to authenticated/);
});
