-- ============================================================================
-- PENDING: least-privilege hardening. NOT applied to any environment.
--
-- WHY THIS IS NOT IN supabase/migrations/
--   Anything in supabase/migrations/ is applied by the next `supabase db push`.
--   These statements change privileges on live tables and must not be pushed unreviewed.
--   The task constraints require a reviewed plan and a verified backup/recovery strategy
--   before any corrective change reaches production. See README.md in this folder.
--
-- WHAT IT DOES
--   Row Level Security does not apply to TRUNCATE. Supabase's default privileges grant
--   ALL on tables in public to anon and authenticated, so `authenticated` currently holds
--   TRUNCATE on every user table. It is not reachable through PostgREST today, but it is a
--   live privilege that any future SECURITY DEFINER function, RPC, or SQL-injection sink
--   could use to wipe every user's training history.
--
-- STEP 1 - RUN THESE READ-ONLY QUERIES FIRST AND RECORD THE OUTPUT.
--   Do not apply this file until you have seen what is actually granted.
-- ============================================================================

-- Expected: one row per privilege already held, per role. Anything beyond SELECT/INSERT/
-- UPDATE/DELETE on `authenticated` for user tables is what this file removes.
--
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and grantee in ('anon', 'authenticated')
--  order by table_name, grantee, privilege_type;

-- Expected: TRUNCATE present for authenticated on these tables (that is the finding).
-- select relname, relrowsecurity, relforcerowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   join pg_roles r on r.oid = c.relowner
--  where n.nspname = 'public' and c.relkind = 'r'
--    and has_table_privilege('authenticated', c.oid, 'TRUNCATE');

-- Expected: no rows. sync_workout_graphs has no caller in src/, mobile/ or api/.
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'sync_workout_graphs';

-- ============================================================================
-- STEP 2 - BACKUP BEFORE APPLYING
--   pg_dump --schema=public "$SUPABASE_DB_URL" > backup-$(date +%Y%m%d).sql
--
-- STEP 3 - APPLY (single transaction; aborts entirely on any error)
-- ============================================================================

begin;

revoke truncate, references, trigger on table
  public.profiles,
  public.exercises,
  public.workout_sessions,
  public.session_exercises,
  public.sets,
  public.bodyweight_logs,
  public.athlete_preferences,
  public.body_metrics_logs,
  public.nutrition_targets,
  public.food_entries
from anon, authenticated;

-- Defence in depth: RLS is bypassed by the table owner. These are client-facing tables and
-- the application never connects as owner, so forcing RLS closes that door too.
alter table public.profiles force row level security;
alter table public.workout_sessions force row level security;
alter table public.session_exercises force row level security;
alter table public.sets force row level security;
alter table public.bodyweight_logs force row level security;
alter table public.athlete_preferences force row level security;
alter table public.body_metrics_logs force row level security;
alter table public.nutrition_targets force row level security;
alter table public.food_entries force row level security;

-- Dead attack surface: granted to authenticated, but no caller exists anywhere in the repo.
revoke execute on function public.sync_workout_graphs(jsonb) from authenticated;

commit;

-- ============================================================================
-- STEP 4 - RE-RUN tests/sql/rls-cross-user.sql against a disposable clone and confirm
-- the application still works (catalog read, sync_workout_graph, save_athlete_metrics).
-- ============================================================================
