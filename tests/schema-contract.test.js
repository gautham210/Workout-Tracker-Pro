import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260920000000_canonical_schema_and_sync.sql', import.meta.url), 'utf8');
const rateLimitMigration = readFileSync(new URL('../supabase/migrations/20260921010000_distributed_api_rate_limits.sql', import.meta.url), 'utf8');
const uuidFixMigration = readFileSync(new URL('../supabase/migrations/20260921020000_fix_sync_graph_uuid_children.sql', import.meta.url), 'utf8');
const accountCleanupMigration = readFileSync(new URL('../supabase/migrations/20260921030000_cascade_auth_account_cleanup.sql', import.meta.url), 'utf8');
const athleteMigration = readFileSync(new URL('../supabase/migrations/20260921040000_athlete_context_nutrition_and_exercise_metadata.sql', import.meta.url), 'utf8');
const athletePermissionsMigration = readFileSync(new URL('../supabase/migrations/20260921050000_repair_athlete_context_permissions.sql', import.meta.url), 'utf8');

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

test('Auth account deletion cascades through every user-owned root record', () => {
  for (const constraint of ['profiles_id_fkey', 'workout_sessions_user_id_fkey', 'bodyweight_logs_user_id_fkey']) {
    assert.match(accountCleanupMigration, new RegExp(`drop constraint if exists ${constraint}`));
  }
  assert.equal((accountCleanupMigration.match(/references auth\.users\(id\) on delete cascade/g) || []).length, 3);
});

test('athlete, nutrition, and metrics records remain user-scoped and use a controlled mutation', () => {
  for (const table of ['athlete_preferences', 'body_metrics_logs', 'nutrition_targets', 'food_entries']) {
    assert.match(athleteMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(athleteMigration, new RegExp(`${table}_own_all`, 'i'));
  }
  assert.match(athleteMigration, /create or replace function public\.save_athlete_metrics\(p_payload jsonb\)/);
  assert.match(athleteMigration, /v_user uuid := auth\.uid\(\)/);
  assert.match(athleteMigration, /revoke all on function public\.save_athlete_metrics\(jsonb\) from public, anon/);
});

test('athlete context tables explicitly grant authenticated CRUD while anonymous access stays denied', () => {
  assert.match(athletePermissionsMigration, /grant select, insert, update, delete on public\.athlete_preferences, public\.body_metrics_logs,/);
  assert.match(athletePermissionsMigration, /public\.nutrition_targets, public\.food_entries to authenticated/);
  assert.match(athletePermissionsMigration, /revoke all on public\.athlete_preferences, public\.body_metrics_logs, public\.nutrition_targets,/);
  for (const table of ['athlete_preferences', 'body_metrics_logs', 'nutrition_targets', 'food_entries']) {
    assert.match(athletePermissionsMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(athletePermissionsMigration, new RegExp(`${table}_own_all`, 'i'));
  }
});

const integrityMigration = readFileSync(new URL('../supabase/migrations/20260922000000_catalog_slugs_and_metrics_integrity.sql', import.meta.url), 'utf8');
const legacyDir = new URL('../supabase/legacy/', import.meta.url);

test('catalogue slugs are unique and seeded from the shared catalogue', () => {
  assert.match(integrityMigration, /create unique index if not exists exercises_slug_key on public\.exercises \(slug\)/);
  assert.match(integrityMigration, /exercises_slug_format_check/);
  assert.match(integrityMigration, /on conflict \(slug\) do update set/);
  assert.match(integrityMigration, /profiles_height_cm_check/);
  assert.match(integrityMigration, /food_entries_analysis_size_check[\s\S]*pg_column_size\(analysis\) < 20000\) not valid/);
  assert.match(integrityMigration, /'flat-dumbbell-press'/);
});

test('sync_workout_graph re-sync removes absent children and pins parents', () => {
  const fn = integrityMigration.slice(integrityMigration.indexOf('create or replace function public.sync_workout_graph(p_workout jsonb)'));
  assert.match(fn, /set search_path = pg_catalog, public, auth/);
  assert.match(fn, /delete from public\.sets where session_exercise_id = v_session_exercise_id::uuid and not \(id = any \(v_keep_sets\)\)/);
  assert.match(fn, /delete from public\.session_exercises se/);
  assert.match(fn, /session exercise belongs to a different workout/);
  assert.match(fn, /set belongs to a different exercise/);
  assert.match(fn, /errcode = '22023'/);
  assert.match(fn, /too many sets in one sync/);
  assert.match(fn, /is_warmup/);
  assert.match(fn, /rest_seconds/);
  assert.match(integrityMigration, /sets_notes_length_check[\s\S]*<= 500/);
  assert.match(integrityMigration, /session_exercises_notes_length_check[\s\S]*<= 1000/);
  assert.match(integrityMigration, /rest_seconds <= 1800/);
});

test('new migration grants never expose functions to anon or public', () => {
  assert.match(integrityMigration, /revoke all on function public\.sync_workout_graph\(jsonb\) from public, anon/);
  assert.match(integrityMigration, /revoke all on function public\.sync_workout_graphs\(jsonb\) from public, anon/);
  assert.match(integrityMigration, /revoke all on function public\.save_athlete_metrics\(jsonb\) from public, anon/);
  assert.match(integrityMigration, /grant execute on function public\.sync_workout_graph\(jsonb\) to authenticated/);
  assert.doesNotMatch(integrityMigration, /grant [^;]*to (anon|public)\b/i);
  assert.match(integrityMigration, /security invoker/);
});

test('legacy SQL lives under supabase/legacy and is marked superseded', () => {
  const root = readdirSync(new URL('../', import.meta.url)).filter((f) => f.endsWith('.sql'));
  assert.deepEqual(root, []);
  const legacy = readdirSync(legacyDir);
  for (const f of ['01_tracker_pro_rebuild.sql', 'upgrade_rest_days.sql', 'README.md']) assert.ok(legacy.includes(f), f);
  assert.match(readFileSync(new URL('README.md', legacyDir), 'utf8'), /must NOT be re-run/);
});

test('early legacy migrations are guarded for an empty database', () => {
  for (const f of ['03_rls_and_schema_hardening.sql', '04_seed_exercises.sql']) {
    assert.match(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'), /to_regclass\('public\./);
  }
  assert.match(readFileSync(new URL('../supabase/migrations/20260921000000_harden_function_grants_and_rls.sql', import.meta.url), 'utf8'), /to_regprocedure\('public\.rls_auto_enable\(\)'\)/);
});
