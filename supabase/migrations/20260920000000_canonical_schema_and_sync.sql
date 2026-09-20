-- Workout Tracker Pro canonical production contract.
-- This migration is additive and can be applied after the repository's older
-- ad-hoc SQL files.  It intentionally derives ownership from auth.uid().

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  tagline text,
  height_cm numeric,
  age integer,
  gender text,
  include_rest_days boolean not null default true,
  rest_days text[] not null default '{}',
  custom_split text[],
  active_loop jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  muscle_group text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null default now(),
  split_type text,
  split_day text,
  notes text,
  duration_minutes integer,
  is_finished boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_duration_minutes_check check (duration_minutes is null or duration_minutes between 0 and 1440),
  constraint workout_sessions_split_type_length check (split_type is null or char_length(split_type) <= 80),
  constraint workout_sessions_split_day_length check (split_day is null or char_length(split_day) <= 80)
);

create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.workout_sessions(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint session_exercises_order_index_check check (order_index >= 0)
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number integer not null default 1,
  weight_kg numeric not null default 0,
  reps integer not null default 1,
  completed boolean not null default true,
  rpe integer,
  rir integer,
  created_at timestamptz not null default now(),
  constraint sets_set_number_check check (set_number >= 1),
  constraint sets_weight_kg_check check (weight_kg >= 0 and weight_kg <= 1000),
  constraint sets_reps_check check (reps between 1 and 500),
  constraint sets_rpe_check check (rpe is null or rpe between 1 and 10),
  constraint sets_rir_check check (rir is null or rir between 0 and 10)
);

create table if not exists public.bodyweight_logs (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null default now(),
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  constraint bodyweight_logs_weight_kg_check check (weight_kg > 0 and weight_kg <= 1000)
);

-- Upgrade the previously divergent repository schemas without assuming which
-- legacy columns exist in a deployed database.
alter table public.workout_sessions add column if not exists split_type text;
alter table public.workout_sessions add column if not exists split_day text;
alter table public.workout_sessions add column if not exists notes text;
alter table public.workout_sessions add column if not exists duration_minutes integer;
alter table public.workout_sessions add column if not exists is_finished boolean not null default false;
alter table public.workout_sessions add column if not exists created_at timestamptz not null default now();
alter table public.workout_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.exercises add column if not exists description text;
alter table public.exercises add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists tagline text;
alter table public.profiles add column if not exists height_cm numeric;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists include_rest_days boolean not null default true;
alter table public.profiles add column if not exists rest_days text[] not null default '{}';
alter table public.profiles add column if not exists custom_split text[];
alter table public.profiles add column if not exists active_loop jsonb;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.session_exercises add column if not exists order_index integer not null default 0;
alter table public.session_exercises add column if not exists created_at timestamptz not null default now();
alter table public.sets add column if not exists set_number integer not null default 1;
alter table public.sets add column if not exists completed boolean not null default true;
alter table public.sets add column if not exists rpe integer;
alter table public.sets add column if not exists rir integer;
alter table public.sets add column if not exists created_at timestamptz not null default now();
alter table public.bodyweight_logs add column if not exists weight_kg numeric;
alter table public.bodyweight_logs add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workout_sessions' and column_name = 'split') then
    execute 'update public.workout_sessions set split_day = coalesce(split_day, split) where split_day is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workout_sessions' and column_name = 'duration') then
    execute 'update public.workout_sessions set duration_minutes = coalesce(duration_minutes, duration) where duration_minutes is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bodyweight_logs' and column_name = 'weight') then
    execute 'update public.bodyweight_logs set weight_kg = coalesce(weight_kg, weight) where weight_kg is null';
  end if;
end $$;

-- The legacy deployment stores calendar dates and text IDs for the catalog,
-- workout sessions, and bodyweight logs. Child graph rows use UUID primary
-- keys, so promote dates without rewriting any record identity.
alter table public.workout_sessions alter column date type timestamptz using date::timestamptz;
alter table public.bodyweight_logs alter column date type timestamptz using date::timestamptz;
update public.session_exercises set order_index = 0 where order_index is null;
update public.sets set completed = true where completed is null;
update public.sets set set_number = 1 where set_number is null;
alter table public.workout_sessions alter column user_id set not null;
alter table public.workout_sessions alter column date set not null;
alter table public.workout_sessions alter column is_finished set not null;
alter table public.session_exercises alter column session_id set not null;
alter table public.session_exercises alter column exercise_id set not null;
alter table public.session_exercises alter column order_index set not null;
alter table public.sets alter column session_exercise_id set not null;
alter table public.sets alter column set_number set not null;
alter table public.sets alter column weight_kg set not null;
alter table public.sets alter column reps set not null;
alter table public.sets alter column completed set not null;
alter table public.bodyweight_logs alter column user_id set not null;
alter table public.bodyweight_logs alter column date set not null;
alter table public.bodyweight_logs alter column weight_kg set not null;

alter table public.workout_sessions drop constraint if exists workout_sessions_duration_minutes_check;
alter table public.workout_sessions drop constraint if exists workout_sessions_split_type_length;
alter table public.workout_sessions drop constraint if exists workout_sessions_split_day_length;
alter table public.session_exercises drop constraint if exists session_exercises_order_index_check;
alter table public.sets drop constraint if exists sets_set_number_check;
alter table public.sets drop constraint if exists sets_weight_kg_check;
alter table public.sets drop constraint if exists sets_reps_check;
alter table public.sets drop constraint if exists sets_rpe_check;
alter table public.sets drop constraint if exists sets_rir_check;
alter table public.bodyweight_logs drop constraint if exists bodyweight_logs_weight_kg_check;
alter table public.workout_sessions add constraint workout_sessions_duration_minutes_check check (duration_minutes is null or duration_minutes between 0 and 1440);
alter table public.workout_sessions add constraint workout_sessions_split_type_length check (split_type is null or char_length(split_type) <= 80);
alter table public.workout_sessions add constraint workout_sessions_split_day_length check (split_day is null or char_length(split_day) <= 80);
alter table public.session_exercises add constraint session_exercises_order_index_check check (order_index >= 0);
alter table public.sets add constraint sets_set_number_check check (set_number >= 1);
alter table public.sets add constraint sets_weight_kg_check check (weight_kg >= 0 and weight_kg <= 1000);
alter table public.sets add constraint sets_reps_check check (reps between 1 and 500);
alter table public.sets add constraint sets_rpe_check check (rpe is null or rpe between 1 and 10);
alter table public.sets add constraint sets_rir_check check (rir is null or rir between 0 and 10);
alter table public.bodyweight_logs add constraint bodyweight_logs_weight_kg_check check (weight_kg > 0 and weight_kg <= 1000);

create index if not exists workout_sessions_user_date_idx on public.workout_sessions(user_id, date desc);
create index if not exists session_exercises_session_order_idx on public.session_exercises(session_id, order_index);
create index if not exists sets_session_exercise_number_idx on public.sets(session_exercise_id, set_number);
create index if not exists bodyweight_logs_user_date_idx on public.bodyweight_logs(user_id, date desc);

-- Replace every existing policy on the canonical tables.  All ownership paths
-- are expressed in both USING and WITH CHECK so inserts cannot forge parents.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('profiles','exercises','workout_sessions','session_exercises','sets','bodyweight_logs')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.bodyweight_logs enable row level security;

create policy "profiles_own_select" on public.profiles for select using (id = auth.uid());
create policy "profiles_own_insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_own_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "exercises_authenticated_read" on public.exercises for select to authenticated using (true);
create policy "sessions_own_all" on public.workout_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "session_exercises_own_all" on public.session_exercises for all
  using (exists (select 1 from public.workout_sessions ws where ws.id = session_id and ws.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions ws where ws.id = session_id and ws.user_id = auth.uid()));
create policy "sets_own_all" on public.sets for all
  using (exists (select 1 from public.session_exercises se join public.workout_sessions ws on ws.id = se.session_id where se.id = session_exercise_id and ws.user_id = auth.uid()))
  with check (exists (select 1 from public.session_exercises se join public.workout_sessions ws on ws.id = se.session_id where se.id = session_exercise_id and ws.user_id = auth.uid()));
create policy "bodyweight_own_all" on public.bodyweight_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Atomically persist one completed workout graph.  IDs are client generated
-- only for idempotency; identity and ownership always come from auth.uid().
create or replace function public.sync_workout_graph(p_workout jsonb)
returns text
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_workout_id text;
  v_existing_owner uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_session_exercise_id text;
  v_exercise_id text;
  v_set_id text;
  v_index integer := 0;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_workout) <> 'object' then raise exception 'workout must be an object'; end if;
  v_workout_id := nullif(p_workout ->> 'id', '');
  if v_workout_id is null or v_workout_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'workout id must be a uuid string'; end if;
  if coalesce((p_workout ->> 'is_finished')::boolean, false) is not true then raise exception 'only completed workouts may be synced'; end if;
  if jsonb_typeof(coalesce(p_workout -> 'exercises', 'null'::jsonb)) <> 'array' then raise exception 'workout exercises must be an array'; end if;
  if jsonb_array_length(p_workout -> 'exercises') > 50 then raise exception 'too many exercises'; end if;

  select user_id into v_existing_owner from public.workout_sessions where id = v_workout_id;
  if v_existing_owner is not null and v_existing_owner <> v_user then raise exception 'workout does not belong to current user' using errcode = '42501'; end if;

  insert into public.workout_sessions (id, user_id, date, split_type, split_day, notes, duration_minutes, is_finished, updated_at)
  values (
    v_workout_id, v_user,
    coalesce(nullif(p_workout ->> 'date', '')::timestamptz, now()),
    nullif(left(p_workout ->> 'split_type', 80), ''),
    nullif(left(p_workout ->> 'split_day', 80), ''),
    nullif(left(p_workout ->> 'notes', 4000), ''),
    case when p_workout ? 'duration_minutes' then greatest(0, least(1440, (p_workout ->> 'duration_minutes')::integer)) else null end,
    true, now()
  ) on conflict (id) do update set
    date = excluded.date, split_type = excluded.split_type, split_day = excluded.split_day,
    notes = excluded.notes, duration_minutes = excluded.duration_minutes, is_finished = true, updated_at = now();

  for v_exercise in select value from jsonb_array_elements(p_workout -> 'exercises') loop
    v_index := v_index + 1;
    v_session_exercise_id := nullif(v_exercise ->> 'id', '');
    v_exercise_id := nullif(v_exercise ->> 'exercise_id', '');
    if v_session_exercise_id is null or v_session_exercise_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'session exercise id must be a uuid string'; end if;
    if v_exercise_id is null or char_length(v_exercise_id) > 200 then raise exception 'invalid exercise id'; end if;
    if not exists (select 1 from public.exercises where id = v_exercise_id) then raise exception 'unknown exercise'; end if;
    if jsonb_typeof(coalesce(v_exercise -> 'sets', 'null'::jsonb)) <> 'array' then raise exception 'exercise sets must be an array'; end if;
    if jsonb_array_length(v_exercise -> 'sets') > 100 then raise exception 'too many sets'; end if;
    if exists (select 1 from public.session_exercises se join public.workout_sessions ws on ws.id = se.session_id where se.id = v_session_exercise_id::uuid and ws.user_id <> v_user) then raise exception 'session exercise does not belong to current user' using errcode = '42501'; end if;
    insert into public.session_exercises (id, session_id, exercise_id, order_index)
    values (v_session_exercise_id::uuid, v_workout_id, v_exercise_id, greatest(0, coalesce((v_exercise ->> 'order_index')::integer, v_index - 1)))
    on conflict (id) do update set session_id = excluded.session_id, exercise_id = excluded.exercise_id, order_index = excluded.order_index;

    for v_set in select value from jsonb_array_elements(v_exercise -> 'sets') loop
      v_set_id := nullif(v_set ->> 'id', '');
      if v_set_id is null or v_set_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'set id must be a uuid string'; end if;
      if coalesce((v_set ->> 'completed')::boolean, false) is not true then raise exception 'incomplete sets cannot be synced'; end if;
      if coalesce((v_set ->> 'weight_kg')::numeric, -1) < 0 or coalesce((v_set ->> 'weight_kg')::numeric, 1001) > 1000 then raise exception 'invalid weight'; end if;
      if coalesce((v_set ->> 'reps')::integer, 0) not between 1 and 500 then raise exception 'invalid reps'; end if;
      if exists (select 1 from public.sets s join public.session_exercises se on se.id = s.session_exercise_id join public.workout_sessions ws on ws.id = se.session_id where s.id = v_set_id::uuid and ws.user_id <> v_user) then raise exception 'set does not belong to current user' using errcode = '42501'; end if;
      insert into public.sets (id, session_exercise_id, set_number, weight_kg, reps, completed, rpe, rir)
      values (v_set_id::uuid, v_session_exercise_id::uuid, greatest(1, coalesce((v_set ->> 'set_number')::integer, 1)), (v_set ->> 'weight_kg')::numeric, (v_set ->> 'reps')::integer, true,
        case when v_set ? 'rpe' and nullif(v_set ->> 'rpe','') is not null then (v_set ->> 'rpe')::integer else null end,
        case when v_set ? 'rir' and nullif(v_set ->> 'rir','') is not null then (v_set ->> 'rir')::integer else null end)
      on conflict (id) do update set session_exercise_id = excluded.session_exercise_id, set_number = excluded.set_number, weight_kg = excluded.weight_kg, reps = excluded.reps, completed = true, rpe = excluded.rpe, rir = excluded.rir;
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.sync_workout_graph(jsonb) from public;
grant execute on function public.sync_workout_graph(jsonb) to authenticated;

create or replace function public.sync_workout_graphs(p_workouts jsonb)
returns integer
language plpgsql
security definer set search_path = public, auth
as $$
declare v_workout jsonb; v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_workouts) <> 'array' or jsonb_array_length(p_workouts) > 100 then raise exception 'workouts must be an array of at most 100 entries'; end if;
  for v_workout in select value from jsonb_array_elements(p_workouts) loop
    perform public.sync_workout_graph(v_workout);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.sync_workout_graphs(jsonb) from public;
grant execute on function public.sync_workout_graphs(jsonb) to authenticated;
