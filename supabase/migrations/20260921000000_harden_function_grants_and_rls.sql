-- Keep trigger and event-trigger helpers internal. SECURITY DEFINER functions
-- must never be directly callable through the exposed PostgREST RPC schema.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- The graph sync functions are intentionally callable by signed-in clients.
-- Explicit grants make this true even if the project's default function grants
-- are changed later, while denying anonymous callers.
revoke all on function public.sync_workout_graph(jsonb) from public, anon;
revoke all on function public.sync_workout_graphs(jsonb) from public, anon;
grant execute on function public.sync_workout_graph(jsonb) to authenticated;
grant execute on function public.sync_workout_graphs(jsonb) to authenticated;

-- Make auth lookups initplans rather than per-row work in RLS predicates.
drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles
  for insert with check ((select auth.uid()) = id);
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists sessions_own_all on public.workout_sessions;
create policy sessions_own_all on public.workout_sessions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists session_exercises_own_all on public.session_exercises;
create policy session_exercises_own_all on public.session_exercises
  for all
  using (exists (
    select 1 from public.workout_sessions ws
    where ws.id = session_exercises.session_id and ws.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_sessions ws
    where ws.id = session_exercises.session_id and ws.user_id = (select auth.uid())
  ));

drop policy if exists sets_own_all on public.sets;
create policy sets_own_all on public.sets
  for all
  using (exists (
    select 1
    from public.session_exercises se
    join public.workout_sessions ws on ws.id = se.session_id
    where se.id = sets.session_exercise_id and ws.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.session_exercises se
    join public.workout_sessions ws on ws.id = se.session_id
    where se.id = sets.session_exercise_id and ws.user_id = (select auth.uid())
  ));

drop policy if exists bodyweight_own_all on public.bodyweight_logs;
create policy bodyweight_own_all on public.bodyweight_logs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
