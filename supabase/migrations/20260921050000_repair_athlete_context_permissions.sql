-- Repair the permission boundary for athlete-context tables already created
-- by 20260921040000.  This migration is additive and intentionally does not
-- alter or delete athlete data.

alter table public.athlete_preferences enable row level security;
alter table public.body_metrics_logs enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.food_entries enable row level security;

drop policy if exists athlete_preferences_own_all on public.athlete_preferences;
create policy athlete_preferences_own_all on public.athlete_preferences for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists body_metrics_logs_own_all on public.body_metrics_logs;
create policy body_metrics_logs_own_all on public.body_metrics_logs for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_targets_own_all on public.nutrition_targets;
create policy nutrition_targets_own_all on public.nutrition_targets for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists food_entries_own_all on public.food_entries;
create policy food_entries_own_all on public.food_entries for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.athlete_preferences, public.body_metrics_logs,
  public.nutrition_targets, public.food_entries to authenticated;
revoke all on public.athlete_preferences, public.body_metrics_logs, public.nutrition_targets,
  public.food_entries from anon;
