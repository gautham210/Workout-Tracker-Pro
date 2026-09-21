-- Athlete context is intentionally additive.  Existing workout records and the
-- canonical graph RPC remain the single source of truth for completed training.
-- Apply this migration after 20260921030000; it is safe on accounts with data.

alter table public.exercises
  add column if not exists aliases text[] not null default '{}',
  add column if not exists equipment text[] not null default '{}',
  add column if not exists movement_pattern text,
  add column if not exists difficulty text,
  add column if not exists primary_muscles text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}',
  add column if not exists instructions text[] not null default '{}',
  add column if not exists form_cues text[] not null default '{}',
  add column if not exists common_mistakes text[] not null default '{}',
  add column if not exists safety_notes text[] not null default '{}',
  add column if not exists visual_key text;

alter table public.profiles
  add column if not exists birth_year integer check (birth_year between 1900 and 2100),
  add column if not exists sex text check (sex in ('female', 'male', 'unspecified')),
  add column if not exists height_cm numeric check (height_cm between 80 and 260),
  add column if not exists training_goal text check (training_goal in ('strength', 'hypertrophy', 'fat_loss', 'maintenance', 'general_fitness')),
  add column if not exists activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'very_active', 'athlete')),
  add column if not exists experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists preferred_session_minutes integer check (preferred_session_minutes between 15 and 240),
  add column if not exists units text check (units in ('metric', 'imperial'));

create table if not exists public.athlete_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_equipment text[] not null default '{}',
  preferred_exercises text[] not null default '{}',
  excluded_exercises text[] not null default '{}',
  nutrition_preferences text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.body_metrics_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  weight_kg numeric check (weight_kg > 0 and weight_kg <= 500),
  waist_cm numeric check (waist_cm > 0 and waist_cm <= 250),
  neck_cm numeric check (neck_cm > 0 and neck_cm <= 120),
  chest_cm numeric check (chest_cm > 0 and chest_cm <= 250),
  hips_cm numeric check (hips_cm > 0 and hips_cm <= 250),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, logged_at)
);

create table if not exists public.nutrition_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calories integer check (calories between 800 and 10000),
  protein_g integer check (protein_g between 0 and 1000),
  carbs_g integer check (carbs_g between 0 and 2000),
  fat_g integer check (fat_g between 0 and 1000),
  fiber_g integer check (fiber_g between 0 and 200),
  water_ml integer check (water_ml between 0 and 15000),
  source text not null default 'manual' check (source in ('manual', 'calculator')),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text not null default 'snack' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(trim(name)) between 1 and 200),
  calories numeric not null check (calories >= 0 and calories <= 10000),
  protein_g numeric not null default 0 check (protein_g >= 0 and protein_g <= 1000),
  carbs_g numeric not null default 0 check (carbs_g >= 0 and carbs_g <= 2000),
  fat_g numeric not null default 0 check (fat_g >= 0 and fat_g <= 1000),
  fiber_g numeric check (fiber_g >= 0 and fiber_g <= 200),
  source text not null default 'manual' check (source in ('manual', 'scan', 'ai_assisted')),
  confidence text check (confidence in ('High', 'Medium', 'Low')),
  assumptions text[] not null default '{}',
  analysis jsonb,
  created_at timestamptz not null default now()
);

create index if not exists body_metrics_logs_user_logged_at_idx on public.body_metrics_logs(user_id, logged_at desc);
create index if not exists food_entries_user_logged_at_idx on public.food_entries(user_id, logged_at desc);
create index if not exists exercises_movement_pattern_idx on public.exercises(movement_pattern);
create index if not exists exercises_difficulty_idx on public.exercises(difficulty);

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

-- The shared catalogue remains read-only to signed-in athletes; no client can
-- create a movement or rewrite its coaching metadata.
grant select on public.exercises to authenticated;
revoke insert, update, delete on public.exercises from authenticated, anon;

-- One authenticated mutation keeps the calculator, canonical profile values,
-- targets, and body metric record coherent.  The payload is deliberately
-- whitelisted; it cannot become a generic update endpoint.
create or replace function public.save_athlete_metrics(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_date date := coalesce(nullif(p_payload ->> 'logged_at', '')::date, current_date);
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'metrics payload must be an object'; end if;
  insert into public.body_metrics_logs (user_id, logged_at, weight_kg, waist_cm, neck_cm, chest_cm, hips_cm, notes)
  values (v_user, v_date, nullif(p_payload ->> 'weight_kg', '')::numeric, nullif(p_payload ->> 'waist_cm', '')::numeric, nullif(p_payload ->> 'neck_cm', '')::numeric, nullif(p_payload ->> 'chest_cm', '')::numeric, nullif(p_payload ->> 'hips_cm', '')::numeric, nullif(left(p_payload ->> 'notes', 500), ''))
  on conflict (user_id, logged_at) do update set weight_kg = excluded.weight_kg, waist_cm = excluded.waist_cm, neck_cm = excluded.neck_cm, chest_cm = excluded.chest_cm, hips_cm = excluded.hips_cm, notes = excluded.notes;
  if nullif(p_payload ->> 'weight_kg', '') is not null then
    insert into public.bodyweight_logs (id, user_id, date, weight_kg) values (gen_random_uuid()::text, v_user, v_date::timestamptz, (p_payload ->> 'weight_kg')::numeric);
  end if;
  update public.profiles set height_cm = nullif(p_payload ->> 'height_cm', '')::numeric, sex = nullif(p_payload ->> 'sex', ''), training_goal = nullif(p_payload ->> 'training_goal', ''), activity_level = nullif(p_payload ->> 'activity_level', ''), updated_at = now() where id = v_user;
  insert into public.nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, source)
  values (v_user, nullif(p_payload ->> 'target_calories', '')::integer, nullif(p_payload ->> 'target_protein_g', '')::integer, nullif(p_payload ->> 'target_carbs_g', '')::integer, nullif(p_payload ->> 'target_fat_g', '')::integer, nullif(p_payload ->> 'target_fiber_g', '')::integer, nullif(p_payload ->> 'target_water_ml', '')::integer, 'calculator')
  on conflict (user_id) do update set calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, water_ml = excluded.water_ml, source = excluded.source, updated_at = now();
end;
$$;
revoke all on function public.save_athlete_metrics(jsonb) from public, anon;
grant execute on function public.save_athlete_metrics(jsonb) to authenticated;
