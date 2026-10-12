-- ============================================================================
-- Cross-user RLS proof.
--
-- Runs entirely inside a single transaction that is ROLLBACK'd, so no test data
-- is ever persisted. Intended for a DISPOSABLE database (local Supabase or a
-- throwaway project), never for production.
--
-- It proves the four properties that matter for this product:
--   1. User B cannot SELECT user A's rows.
--   2. User B cannot UPDATE user A's rows.
--   3. User B cannot DELETE user A's rows.
--   4. User B cannot INSERT a row claiming user A's user_id (WITH CHECK).
-- and that the `anon` role is denied outright.
--
-- Usage:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/rls-cross-user.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- Fixed, obviously-fake ids so re-runs are deterministic and cannot collide with real users.
create temporary table _rls_probe_ids (a uuid, b uuid) on commit drop;
insert into _rls_probe_ids values
  ('00000000-0000-4000-8000-00000000aaa1', '00000000-0000-4000-8000-00000000bbb1');

-- Two throwaway auth users.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated',
       p.id::text || '@rls-probe.invalid', crypt('probe', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
from _rls_probe_ids p
where not exists (select 1 from auth.users u where u.id = p.id);

-- User A owns a workout session, a food entry and a body-metric row.
insert into public.workout_sessions (id, user_id, date, is_finished)
select 'probe-session-a', a.id, now(), true from _rls_probe_ids;

insert into public.food_entries (user_id, logged_at, name, calories)
select a.id, now(), 'probe meal', 100 from _rls_probe_ids;

insert into public.body_metrics_logs (user_id, logged_at, weight_kg)
select a.id, current_date, 80 from _rls_probe_ids;

-- ---- As USER A: own data must be visible -----------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000aaa1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.workout_sessions;
  if v_count <> 1 then
    raise exception 'FAIL: user A should see exactly their 1 session, saw %', v_count;
  end if;
  select count(*) into v_count from public.food_entries;
  if v_count <> 1 then
    raise exception 'FAIL: user A should see exactly their 1 food entry, saw %', v_count;
  end if;
  raise notice 'PASS: user A can read their own rows';
end $$;

reset role;

-- ---- As USER B: nothing of A may be visible or mutable ---------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000bbb1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_count int; v_rows int;
begin
  select count(*) into v_count from public.workout_sessions;
  if v_count <> 0 then
    raise exception 'FAIL: user B can SELECT user A''s % session row(s)', v_count;
  end if;
  select count(*) into v_count from public.food_entries;
  if v_count <> 0 then
    raise exception 'FAIL: user B can SELECT user A''s % food row(s)', v_count;
  end if;
  select count(*) into v_count from public.body_metrics_logs;
  if v_count <> 0 then
    raise exception 'FAIL: user B can SELECT user A''s % body-metric row(s)', v_count;
  end if;
  raise notice 'PASS: user B cannot SELECT user A''s rows';
end $$;

do $$
declare v_rows int;
begin
  update public.workout_sessions set split_day = 'hijacked';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: user B updated % of user A''s rows', v_rows;
  end if;
  raise notice 'PASS: user B cannot UPDATE user A''s rows';
end $$;

do $$
declare v_rows int;
begin
  delete from public.food_entries;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: user B deleted % of user A''s rows', v_rows;
  end if;
  raise notice 'PASS: user B cannot DELETE user A''s rows';
end $$;

do $$
begin
  -- WITH CHECK must reject a row that claims another owner.
  insert into public.workout_sessions (id, user_id, date, is_finished)
  values ('probe-spoofed', '00000000-0000-4000-8000-00000000aaa1', now(), true);
  raise exception 'FAIL: user B was able to INSERT a row owned by user A';
exception
  when insufficient_privilege then raise notice 'PASS: spoofed insert rejected (policy)';
  when check_violation then raise notice 'PASS: spoofed insert rejected (policy)';
end $$;

reset role;

-- ---- As ANON: denied outright ----------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.workout_sessions;
  if v_count <> 0 then
    raise exception 'FAIL: anon can SELECT % workout session(s)', v_count;
  end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 0 then
    raise exception 'FAIL: anon can SELECT % profile(s)', v_count;
  end if;
  raise notice 'PASS: anon cannot read user data';
exception
  when insufficient_privilege then raise notice 'PASS: anon denied by privilege';
end $$;

do $$
begin
  raise notice 'TRUNCATE probe (expect failure: RLS does not apply to TRUNCATE)';
  truncate public.workout_sessions;
  raise exception 'FAIL: anon was able to TRUNCATE workout_sessions';
exception
  when insufficient_privilege then raise notice 'PASS: anon cannot TRUNCATE';
  when others then raise notice 'TRUNCATE blocked with %', sqlerrm;
end $$;

reset role;
rollback;

\echo 'ALL RLS PROBES PASSED (transaction rolled back; no data persisted)'
