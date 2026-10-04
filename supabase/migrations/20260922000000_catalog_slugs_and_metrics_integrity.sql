-- Catalogue slugs, metrics integrity and a safer workout graph sync.
-- Additive and idempotent: safe on the live database and on an empty one.

-- ---------------------------------------------------------------------------
-- 1. Stable exercise slugs (equal to the `key` in shared/exerciseCatalog.js).
-- ---------------------------------------------------------------------------
alter table public.exercises add column if not exists slug text;
alter table public.exercises add column if not exists visual_key text;

with base as (
  select id,
         coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'exercise') as b,
         row_number() over (
           partition by coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'exercise')
           order by created_at, id
         ) as rn
  from public.exercises
  where slug is null
)
update public.exercises e
set slug = base.b || case
      when base.rn > 1 or exists (select 1 from public.exercises x where x.slug = base.b)
        then '-' || left(replace(e.id, '-', ''), 8)
      else '' end
from base
where e.id = base.id and e.slug is null;

create unique index if not exists exercises_slug_key on public.exercises (slug);

do $guard$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_slug_format_check' and conrelid = 'public.exercises'::regclass) then
    alter table public.exercises
      add constraint exercises_slug_format_check
      check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
  end if;
  begin
    alter table public.exercises validate constraint exercises_slug_format_check;
  exception when check_violation then
    raise notice 'exercises_slug_format_check left NOT VALID: existing rows violate it';
  end;
end
$guard$;

-- Seed / refresh the catalogue. Only metadata columns are filled on conflict; ids
-- and names are never rewritten.
insert into public.exercises (slug, name, muscle_group, movement_pattern, difficulty, primary_muscles, equipment, aliases, form_cues, common_mistakes)
select v.slug, v.name, v.muscle_group, v.movement_pattern, v.difficulty, v.primary_muscles, v.equipment, v.aliases, v.form_cues, v.common_mistakes
from (values
    ('barbell-bench-press', 'Barbell Bench Press', 'Chest', 'horizontal_press', 'intermediate', array['Chest', 'Triceps', 'Front delts']::text[], array['Barbell', 'Bench']::text[], array['bench press', 'flat barbell bench press', 'bb bench']::text[], array['Keep shoulder blades set and feet planted.', 'Lower with control to the lower chest.']::text[], array['Bouncing the bar', 'Flaring elbows without control']::text[]),
    ('incline-dumbbell-press', 'Incline Dumbbell Press', 'Chest', 'incline_press', 'intermediate', array['Upper chest', 'Triceps', 'Front delts']::text[], array['Dumbbells', 'Bench']::text[], array['incline db press', 'incline press']::text[], array['Use a modest incline.', 'Keep wrists stacked over elbows.']::text[], array['Turning the press into a shoulder press']::text[]),
    ('flat-dumbbell-press', 'Flat Dumbbell Press', 'Chest', 'horizontal_press', 'beginner', array['Chest', 'Triceps', 'Front delts']::text[], array['Dumbbells', 'Bench']::text[], array['flat db press', 'flat db', 'dumbbell bench press', 'db bench press']::text[], array['Press in a slight arc.', 'Keep forearms vertical.']::text[], array['Letting the dumbbells drift wide']::text[]),
    ('chest-fly', 'Chest Fly', 'Chest', 'fly', 'beginner', array['Chest']::text[], array['Dumbbells', 'Cable']::text[], array['chest flys', 'pec fly', 'dumbbell fly', 'cable fly']::text[], array['Keep a soft bend in the elbows.', 'Stop when you feel a deep chest stretch.']::text[], array['Turning the fly into a press']::text[]),
    ('push-up', 'Push-up', 'Chest', 'push_up', 'beginner', array['Chest', 'Triceps', 'Front delts']::text[], array['Bodyweight']::text[], array['push up', 'pushup', 'push ups', 'pushups']::text[], array['Keep a straight line from head to heels.', 'Lower the chest between the hands.']::text[], array['Sagging hips']::text[]),
    ('barbell-deadlift', 'Barbell Deadlift', 'Back', 'hinge', 'intermediate', array['Glutes', 'Hamstrings', 'Back']::text[], array['Barbell']::text[], array['deadlift', 'conventional deadlift']::text[], array['Push the floor away.', 'Keep the bar close.']::text[], array['Jerking the bar from the floor']::text[]),
    ('romanian-deadlift', 'Romanian Deadlift', 'Legs', 'hinge', 'intermediate', array['Hamstrings', 'Glutes']::text[], array['Barbell', 'Dumbbells']::text[], array['rdl', 'stiff leg deadlift']::text[], array['Send hips back.', 'Keep a soft knee.']::text[], array['Squatting the hinge']::text[]),
    ('pull-up', 'Pull-up', 'Back', 'vertical_pull', 'intermediate', array['Lats', 'Biceps']::text[], array['Pull-up bar']::text[], array['pull up', 'pullup', 'pull ups', 'pullups', 'weighted pull up', 'chin up', 'chinup']::text[], array['Start from a controlled hang.', 'Drive elbows down.']::text[], array['Shrugging into the shoulders']::text[]),
    ('lat-pulldown', 'Lat Pulldown', 'Back', 'vertical_pull', 'beginner', array['Lats', 'Biceps']::text[], array['Cable']::text[], array['wide grip lat pulldown', 'latpulldown', 'lat pull down', 'pulldown']::text[], array['Keep chest tall.', 'Pull elbows to ribs.']::text[], array['Pulling behind the neck']::text[]),
    ('seated-cable-row', 'Seated Cable Row', 'Back', 'horizontal_pull', 'beginner', array['Mid back', 'Lats', 'Biceps']::text[], array['Cable']::text[], array['cable row', 'seated row', 'low row']::text[], array['Keep ribs stacked.', 'Pause at the torso.']::text[], array['Rounding through the return']::text[]),
    ('barbell-row', 'Barbell Row', 'Back', 'horizontal_pull', 'intermediate', array['Lats', 'Mid back', 'Biceps']::text[], array['Barbell']::text[], array['bent over row', 'bb row', 'bent over barbell row']::text[], array['Brace the torso.', 'Row toward the hip.']::text[], array['Using excessive momentum']::text[]),
    ('overhead-press', 'Overhead Press', 'Shoulders', 'vertical_press', 'intermediate', array['Delts', 'Triceps']::text[], array['Barbell', 'Dumbbells']::text[], array['standing overhead press', 'shoulder press', 'military press', 'ohp']::text[], array['Brace glutes and trunk.', 'Finish with biceps by ears.']::text[], array['Leaning back through the lower back']::text[]),
    ('lateral-raise', 'Lateral Raise', 'Shoulders', 'raise', 'beginner', array['Side delts']::text[], array['Dumbbells', 'Cable']::text[], array['side raise', 'side lateral raise', 'lat raise']::text[], array['Lead with elbows.', 'Use a controlled arc.']::text[], array['Swinging the weights']::text[]),
    ('reverse-fly', 'Reverse Fly', 'Shoulders', 'raise', 'beginner', array['Rear delts']::text[], array['Dumbbells', 'Cable']::text[], array['rear delt fly', 'reverse flys', 'rear fly']::text[], array['Hinge forward with a flat back.', 'Lead with the elbows.']::text[], array['Shrugging the traps']::text[]),
    ('bicep-curl', 'Bicep Curl', 'Arms', 'curl', 'beginner', array['Biceps']::text[], array['Dumbbells', 'Barbell', 'Cable']::text[], array['biceps curl', 'dumbbell curl', 'barbell curl', 'curl', 'curls']::text[], array['Keep elbows near the ribs.', 'Control the lowering phase.']::text[], array['Throwing hips into each rep']::text[]),
    ('hammer-curl', 'Hammer Curl', 'Arms', 'curl', 'beginner', array['Brachialis', 'Biceps']::text[], array['Dumbbells']::text[], array['hammer curls']::text[], array['Keep palms facing in.', 'Do not swing the torso.']::text[], array['Using momentum']::text[]),
    ('tricep-pushdown', 'Tricep Pushdown', 'Arms', 'extension', 'beginner', array['Triceps']::text[], array['Cable']::text[], array['triceps pushdown', 'cable pushdown', 'rope pushdown', 'pushdown']::text[], array['Lock upper arms in place.', 'Finish with a controlled extension.']::text[], array['Letting elbows drift forward']::text[]),
    ('overhead-tricep-extension', 'Overhead Tricep Extension', 'Arms', 'extension', 'beginner', array['Triceps (long head)']::text[], array['Dumbbells', 'Cable']::text[], array['overhead triceps extension', 'dumbbell overhead', 'dumbell overhead', 'french press']::text[], array['Keep elbows pointing forward.', 'Lower to a deep stretch.']::text[], array['Flaring the elbows']::text[]),
    ('barbell-squat', 'Barbell Squat', 'Legs', 'squat', 'intermediate', array['Quads', 'Glutes']::text[], array['Barbell', 'Rack']::text[], array['back squat', 'squat', 'squats']::text[], array['Brace before descending.', 'Track knees over toes.']::text[], array['Losing trunk tension']::text[]),
    ('leg-press', 'Leg Press', 'Legs', 'squat', 'beginner', array['Quads', 'Glutes']::text[], array['Machine']::text[], array[]::text[], array['Keep hips supported.', 'Use a pain-free depth.']::text[], array['Locking knees hard']::text[]),
    ('leg-extension', 'Leg Extension', 'Legs', 'knee_extension', 'beginner', array['Quads']::text[], array['Machine']::text[], array['leg extensions']::text[], array['Squeeze at the top.', 'Control the lowering phase.']::text[], array['Swinging the weight up']::text[]),
    ('leg-curl', 'Leg Curl', 'Legs', 'knee_flexion', 'beginner', array['Hamstrings']::text[], array['Machine']::text[], array['hamstring curl', 'lying leg curl', 'seated leg curl']::text[], array['Control the return.', 'Keep hips anchored.']::text[], array['Rushing the eccentric']::text[]),
    ('standing-calf-raise', 'Standing Calf Raise', 'Legs', 'calf_raise', 'beginner', array['Calves']::text[], array['Machine', 'Bodyweight']::text[], array['calf raise', 'calf raises']::text[], array['Pause at the stretched position.', 'Finish tall.']::text[], array['Bouncing through reps']::text[]),
    ('bulgarian-split-squat', 'Bulgarian Split Squat', 'Legs', 'lunge', 'intermediate', array['Quads', 'Glutes']::text[], array['Dumbbells', 'Bench']::text[], array['split squat', 'rear foot elevated split squat', 'lunge', 'lunges']::text[], array['Keep the torso tall.', 'Drop straight down.']::text[], array['Front foot too close to the bench']::text[]),
    ('crunch', 'Crunch', 'Core', 'crunch', 'beginner', array['Abs']::text[], array['Bodyweight']::text[], array['crunches', 'ab crunch']::text[], array['Curl the ribs toward the pelvis.', 'Keep the neck relaxed.']::text[], array['Pulling on the neck']::text[]),
    ('plank', 'Plank', 'Core', 'anti_extension', 'beginner', array['Core']::text[], array['Bodyweight']::text[], array['planks', 'front plank']::text[], array['Keep ribs down.', 'Squeeze glutes.']::text[], array['Letting hips sag']::text[]),
    ('hanging-leg-raise', 'Hanging Leg Raise', 'Core', 'hang_raise', 'intermediate', array['Lower abs', 'Hip flexors']::text[], array['Pull-up bar']::text[], array['hanging knee raise', 'leg raise']::text[], array['Avoid swinging.', 'Curl the pelvis up at the top.']::text[], array['Using momentum']::text[])
) as v(slug, name, muscle_group, movement_pattern, difficulty, primary_muscles, equipment, aliases, form_cues, common_mistakes)
where not exists (
  select 1 from public.exercises x where x.name = v.name and x.slug is distinct from v.slug
)
on conflict (slug) do update set
  movement_pattern = excluded.movement_pattern,
  difficulty = excluded.difficulty,
  primary_muscles = excluded.primary_muscles,
  equipment = excluded.equipment,
  aliases = excluded.aliases,
  form_cues = excluded.form_cues,
  common_mistakes = excluded.common_mistakes;

update public.exercises set visual_key = slug where visual_key is null and slug is not null;

-- ---------------------------------------------------------------------------
-- 2. Profile height check, food analysis size, bodyweight day uniqueness.
-- ---------------------------------------------------------------------------
do $guard$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_height_cm_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_height_cm_check
      check (height_cm is null or (height_cm >= 80 and height_cm <= 260)) not valid;
  end if;
  begin
    alter table public.profiles validate constraint profiles_height_cm_check;
  exception when check_violation then
    raise notice 'profiles_height_cm_check left NOT VALID: existing rows violate it';
  end;

  if not exists (select 1 from pg_constraint where conname = 'food_entries_analysis_size_check' and conrelid = 'public.food_entries'::regclass) then
    alter table public.food_entries
      add constraint food_entries_analysis_size_check
      check (analysis is null or pg_column_size(analysis) < 20000) not valid;
  end if;

  -- One bodyweight row per user and UTC day, only when existing data allows it.
  if not exists (select 1 from pg_class where relname = 'bodyweight_logs_user_utc_day_key' and relnamespace = 'public'::regnamespace) then
    if exists (
      select 1 from public.bodyweight_logs
      group by user_id, ((date at time zone 'utc')::date)
      having count(*) > 1
    ) then
      raise notice 'bodyweight_logs has duplicate days; unique day index skipped';
    else
      create unique index bodyweight_logs_user_utc_day_key
        on public.bodyweight_logs (user_id, ((date at time zone 'utc')::date));
    end if;
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 3. updated_at touch trigger.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

do $guard$
declare
  t text;
begin
  foreach t in array array['profiles', 'athlete_preferences', 'nutrition_targets', 'workout_sessions'] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at')
       and not exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || t) and tgname = t || '_touch_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch_updated_at', t);
    end if;
  end loop;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 4. Warmup / notes columns for the workout graph.
-- ---------------------------------------------------------------------------
alter table public.sets add column if not exists is_warmup boolean not null default false;
alter table public.sets add column if not exists notes text;
alter table public.session_exercises add column if not exists notes text;
alter table public.session_exercises add column if not exists rest_seconds integer;

do $guard$
begin
  if not exists (select 1 from pg_constraint where conname = 'sets_notes_length_check' and conrelid = 'public.sets'::regclass) then
    alter table public.sets add constraint sets_notes_length_check check (notes is null or char_length(notes) <= 500) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_exercises_notes_length_check' and conrelid = 'public.session_exercises'::regclass) then
    alter table public.session_exercises add constraint session_exercises_notes_length_check check (notes is null or char_length(notes) <= 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_exercises_rest_seconds_check' and conrelid = 'public.session_exercises'::regclass) then
    alter table public.session_exercises add constraint session_exercises_rest_seconds_check check (rest_seconds is null or (rest_seconds >= 0 and rest_seconds <= 1800)) not valid;
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 5. save_athlete_metrics: only keys present in the payload are overwritten.
-- ---------------------------------------------------------------------------
create or replace function public.save_athlete_metrics(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_date date;
  v_age integer;
  v_birth_year integer;
  v_weight numeric;
  v_updated integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'metrics payload must be an object' using errcode = '22023';
  end if;

  begin
    v_date := coalesce(nullif(p_payload ->> 'logged_at', '')::date, current_date);
    v_weight := nullif(p_payload ->> 'weight_kg', '')::numeric;

    if nullif(p_payload ->> 'age', '') is not null then
      v_age := (p_payload ->> 'age')::integer;
      if v_age < 5 or v_age > 120 then
        raise exception 'age must be between 5 and 120' using errcode = '22023';
      end if;
      v_birth_year := extract(year from current_date)::integer - v_age;
    end if;

    insert into public.body_metrics_logs (user_id, logged_at, weight_kg, waist_cm, neck_cm, chest_cm, hips_cm, notes)
    values (v_user, v_date, v_weight,
      nullif(p_payload ->> 'waist_cm', '')::numeric, nullif(p_payload ->> 'neck_cm', '')::numeric,
      nullif(p_payload ->> 'chest_cm', '')::numeric, nullif(p_payload ->> 'hips_cm', '')::numeric,
      nullif(left(p_payload ->> 'notes', 500), ''))
    on conflict (user_id, logged_at) do update set
      weight_kg = case when p_payload ? 'weight_kg' then excluded.weight_kg else public.body_metrics_logs.weight_kg end,
      waist_cm = case when p_payload ? 'waist_cm' then excluded.waist_cm else public.body_metrics_logs.waist_cm end,
      neck_cm = case when p_payload ? 'neck_cm' then excluded.neck_cm else public.body_metrics_logs.neck_cm end,
      chest_cm = case when p_payload ? 'chest_cm' then excluded.chest_cm else public.body_metrics_logs.chest_cm end,
      hips_cm = case when p_payload ? 'hips_cm' then excluded.hips_cm else public.body_metrics_logs.hips_cm end,
      notes = case when p_payload ? 'notes' then excluded.notes else public.body_metrics_logs.notes end;

    if v_weight is not null then
      update public.bodyweight_logs
      set weight_kg = v_weight
      where user_id = v_user and (date at time zone 'utc')::date = v_date;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        begin
          insert into public.bodyweight_logs (id, user_id, date, weight_kg)
          values (gen_random_uuid()::text, v_user, (v_date::timestamp at time zone 'utc'), v_weight);
        exception when unique_violation then
          update public.bodyweight_logs
          set weight_kg = v_weight
          where user_id = v_user and (date at time zone 'utc')::date = v_date;
        end;
      end if;
    end if;

    insert into public.profiles (id, height_cm, sex, training_goal, activity_level, birth_year, updated_at)
    values (v_user,
      nullif(p_payload ->> 'height_cm', '')::numeric, nullif(p_payload ->> 'sex', ''),
      nullif(p_payload ->> 'training_goal', ''), nullif(p_payload ->> 'activity_level', ''),
      v_birth_year, now())
    on conflict (id) do update set
      height_cm = case when p_payload ? 'height_cm' then excluded.height_cm else public.profiles.height_cm end,
      sex = case when p_payload ? 'sex' then excluded.sex else public.profiles.sex end,
      training_goal = case when p_payload ? 'training_goal' then excluded.training_goal else public.profiles.training_goal end,
      activity_level = case when p_payload ? 'activity_level' then excluded.activity_level else public.profiles.activity_level end,
      birth_year = case when v_birth_year is not null then excluded.birth_year else public.profiles.birth_year end,
      updated_at = now();

    if p_payload ?| array['target_calories', 'target_protein_g', 'target_carbs_g', 'target_fat_g', 'target_fiber_g', 'target_water_ml'] then
      insert into public.nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, source)
      values (v_user,
        nullif(p_payload ->> 'target_calories', '')::integer, nullif(p_payload ->> 'target_protein_g', '')::integer,
        nullif(p_payload ->> 'target_carbs_g', '')::integer, nullif(p_payload ->> 'target_fat_g', '')::integer,
        nullif(p_payload ->> 'target_fiber_g', '')::integer, nullif(p_payload ->> 'target_water_ml', '')::integer,
        'calculator')
      on conflict (user_id) do update set
        calories = case when p_payload ? 'target_calories' then excluded.calories else public.nutrition_targets.calories end,
        protein_g = case when p_payload ? 'target_protein_g' then excluded.protein_g else public.nutrition_targets.protein_g end,
        carbs_g = case when p_payload ? 'target_carbs_g' then excluded.carbs_g else public.nutrition_targets.carbs_g end,
        fat_g = case when p_payload ? 'target_fat_g' then excluded.fat_g else public.nutrition_targets.fat_g end,
        fiber_g = case when p_payload ? 'target_fiber_g' then excluded.fiber_g else public.nutrition_targets.fiber_g end,
        water_ml = case when p_payload ? 'target_water_ml' then excluded.water_ml else public.nutrition_targets.water_ml end,
        source = 'calculator',
        updated_at = now();
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'metrics payload contains an invalid value' using errcode = '22023';
  end;
end;
$$;
revoke all on function public.save_athlete_metrics(jsonb) from public, anon;
grant execute on function public.save_athlete_metrics(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. sync_workout_graph: authoritative re-sync, no cross-parent moves.
-- ---------------------------------------------------------------------------
create or replace function public.sync_workout_graph(p_workout jsonb)
returns text
language plpgsql
security definer set search_path = pg_catalog, public, auth
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
  v_total_sets integer := 0;
  v_duration numeric;
  v_duration_minutes integer;
  v_existing_parent_session text;
  v_existing_parent_exercise uuid;
  v_existing_set_owner uuid;
  v_keep_exercises uuid[] := '{}';
  v_keep_sets uuid[];
  v_is_warmup boolean;
  v_set_notes text;
  v_exercise_notes text;
  v_rest_seconds integer;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_workout is null or jsonb_typeof(p_workout) <> 'object' then raise exception 'workout must be an object' using errcode = '22023'; end if;

  begin
    v_workout_id := nullif(p_workout ->> 'id', '');
    if v_workout_id is null or v_workout_id !~* v_uuid_re then raise exception 'workout id must be a uuid string' using errcode = '22023'; end if;
    if coalesce((p_workout ->> 'is_finished')::boolean, false) is not true then raise exception 'only completed workouts may be synced' using errcode = '22023'; end if;
    if jsonb_typeof(coalesce(p_workout -> 'exercises', 'null'::jsonb)) <> 'array' then raise exception 'workout exercises must be an array' using errcode = '22023'; end if;
    if jsonb_array_length(p_workout -> 'exercises') > 50 then raise exception 'too many exercises' using errcode = '22023'; end if;

    if nullif(p_workout ->> 'duration_minutes', '') is not null then
      v_duration := round((p_workout ->> 'duration_minutes')::numeric);
      v_duration_minutes := greatest(0, least(1440, v_duration))::integer;
    end if;

    select user_id into v_existing_owner from public.workout_sessions where id = v_workout_id;
    if v_existing_owner is not null and v_existing_owner <> v_user then raise exception 'workout does not belong to current user' using errcode = '42501'; end if;

    insert into public.workout_sessions (id, user_id, date, split_type, split_day, notes, duration_minutes, is_finished, updated_at)
    values (
      v_workout_id, v_user,
      coalesce(nullif(p_workout ->> 'date', '')::timestamptz, now()),
      nullif(left(p_workout ->> 'split_type', 80), ''),
      nullif(left(p_workout ->> 'split_day', 80), ''),
      nullif(left(p_workout ->> 'notes', 4000), ''),
      v_duration_minutes,
      true, now()
    ) on conflict (id) do update set
      date = excluded.date, split_type = excluded.split_type, split_day = excluded.split_day,
      notes = excluded.notes, duration_minutes = excluded.duration_minutes, is_finished = true, updated_at = now()
      where public.workout_sessions.user_id = v_user;

    for v_exercise in select value from jsonb_array_elements(p_workout -> 'exercises') loop
      v_index := v_index + 1;
      if jsonb_typeof(v_exercise) <> 'object' then raise exception 'exercise must be an object' using errcode = '22023'; end if;
      v_session_exercise_id := nullif(v_exercise ->> 'id', '');
      v_exercise_id := nullif(v_exercise ->> 'exercise_id', '');
      if v_session_exercise_id is null or v_session_exercise_id !~* v_uuid_re then raise exception 'session exercise id must be a uuid string' using errcode = '22023'; end if;
      if v_exercise_id is null or char_length(v_exercise_id) > 200 then raise exception 'invalid exercise id' using errcode = '22023'; end if;
      if not exists (select 1 from public.exercises where id = v_exercise_id) then raise exception 'unknown exercise' using errcode = '22023'; end if;
      if jsonb_typeof(coalesce(v_exercise -> 'sets', 'null'::jsonb)) <> 'array' then raise exception 'exercise sets must be an array' using errcode = '22023'; end if;
      if jsonb_array_length(v_exercise -> 'sets') > 100 then raise exception 'too many sets' using errcode = '22023'; end if;
      v_total_sets := v_total_sets + jsonb_array_length(v_exercise -> 'sets');
      if v_total_sets > 2000 then raise exception 'too many sets in workout' using errcode = '22023'; end if;

      v_exercise_notes := null;
      if jsonb_typeof(v_exercise -> 'notes') = 'string' then
        v_exercise_notes := nullif(left(v_exercise ->> 'notes', 1000), '');
      elsif jsonb_typeof(v_exercise -> 'notes') is not null and jsonb_typeof(v_exercise -> 'notes') <> 'null' then
        raise exception 'exercise notes must be a string' using errcode = '22023';
      end if;
      v_rest_seconds := null;
      if jsonb_typeof(v_exercise -> 'rest_seconds') = 'number' then
        v_rest_seconds := round((v_exercise ->> 'rest_seconds')::numeric)::integer;
        if v_rest_seconds < 0 or v_rest_seconds > 1800 then raise exception 'rest_seconds must be between 0 and 1800' using errcode = '22023'; end if;
      elsif jsonb_typeof(v_exercise -> 'rest_seconds') is not null and jsonb_typeof(v_exercise -> 'rest_seconds') <> 'null' then
        raise exception 'rest_seconds must be a number' using errcode = '22023';
      end if;

      v_existing_parent_session := null;
      select se.session_id, ws.user_id into v_existing_parent_session, v_existing_owner
      from public.session_exercises se
      join public.workout_sessions ws on ws.id = se.session_id
      where se.id = v_session_exercise_id::uuid;
      if v_existing_parent_session is not null then
        if v_existing_owner <> v_user then raise exception 'session exercise does not belong to current user' using errcode = '42501'; end if;
        if v_existing_parent_session <> v_workout_id then raise exception 'session exercise belongs to a different workout' using errcode = '22023'; end if;
      end if;

      insert into public.session_exercises (id, session_id, exercise_id, order_index, notes, rest_seconds)
      values (v_session_exercise_id::uuid, v_workout_id, v_exercise_id,
        greatest(0, coalesce((v_exercise ->> 'order_index')::integer, v_index - 1)), v_exercise_notes, v_rest_seconds)
      on conflict (id) do update set
        exercise_id = excluded.exercise_id, order_index = excluded.order_index,
        notes = excluded.notes, rest_seconds = excluded.rest_seconds
        where public.session_exercises.session_id = v_workout_id;
      v_keep_exercises := v_keep_exercises || v_session_exercise_id::uuid;
      v_keep_sets := '{}';

      for v_set in select value from jsonb_array_elements(v_exercise -> 'sets') loop
        if jsonb_typeof(v_set) <> 'object' then raise exception 'set must be an object' using errcode = '22023'; end if;
        v_set_id := nullif(v_set ->> 'id', '');
        if v_set_id is null or v_set_id !~* v_uuid_re then raise exception 'set id must be a uuid string' using errcode = '22023'; end if;
        if coalesce((v_set ->> 'completed')::boolean, false) is not true then raise exception 'incomplete sets cannot be synced' using errcode = '22023'; end if;
        if coalesce((v_set ->> 'weight_kg')::numeric, -1) < 0 or coalesce((v_set ->> 'weight_kg')::numeric, 1001) > 1000 then raise exception 'invalid weight' using errcode = '22023'; end if;
        if coalesce((v_set ->> 'reps')::integer, 0) not between 1 and 500 then raise exception 'invalid reps' using errcode = '22023'; end if;

        v_is_warmup := false;
        if jsonb_typeof(v_set -> 'is_warmup') = 'boolean' then
          v_is_warmup := (v_set ->> 'is_warmup')::boolean;
        elsif jsonb_typeof(v_set -> 'is_warmup') is not null and jsonb_typeof(v_set -> 'is_warmup') <> 'null' then
          raise exception 'is_warmup must be a boolean' using errcode = '22023';
        end if;
        v_set_notes := null;
        if jsonb_typeof(v_set -> 'notes') = 'string' then
          v_set_notes := nullif(left(v_set ->> 'notes', 500), '');
        elsif jsonb_typeof(v_set -> 'notes') is not null and jsonb_typeof(v_set -> 'notes') <> 'null' then
          raise exception 'set notes must be a string' using errcode = '22023';
        end if;

        v_existing_parent_exercise := null;
        select s.session_exercise_id, ws.user_id into v_existing_parent_exercise, v_existing_set_owner
        from public.sets s
        join public.session_exercises se on se.id = s.session_exercise_id
        join public.workout_sessions ws on ws.id = se.session_id
        where s.id = v_set_id::uuid;
        if v_existing_parent_exercise is not null then
          if v_existing_set_owner <> v_user then raise exception 'set does not belong to current user' using errcode = '42501'; end if;
          if v_existing_parent_exercise <> v_session_exercise_id::uuid then raise exception 'set belongs to a different exercise' using errcode = '22023'; end if;
        end if;

        insert into public.sets (id, session_exercise_id, set_number, weight_kg, reps, completed, rpe, rir, is_warmup, notes)
        values (v_set_id::uuid, v_session_exercise_id::uuid, greatest(1, coalesce((v_set ->> 'set_number')::integer, 1)),
          (v_set ->> 'weight_kg')::numeric, (v_set ->> 'reps')::integer, true,
          case when nullif(v_set ->> 'rpe', '') is not null then (v_set ->> 'rpe')::integer else null end,
          case when nullif(v_set ->> 'rir', '') is not null then (v_set ->> 'rir')::integer else null end,
          v_is_warmup, v_set_notes)
        on conflict (id) do update set
          set_number = excluded.set_number, weight_kg = excluded.weight_kg, reps = excluded.reps, completed = true,
          rpe = excluded.rpe, rir = excluded.rir, is_warmup = excluded.is_warmup, notes = excluded.notes
          where public.sets.session_exercise_id = v_session_exercise_id::uuid;
        v_keep_sets := v_keep_sets || v_set_id::uuid;
      end loop;

      -- Sets removed from the payload for this exercise are removed from the workout.
      delete from public.sets where session_exercise_id = v_session_exercise_id::uuid and not (id = any (v_keep_sets));
    end loop;

    -- Exercises (and, by cascade, sets) absent from the payload are removed.
    -- v_workout_id is owned by the caller: it was just upserted for v_user.
    delete from public.session_exercises se
    where se.session_id = v_workout_id
      and not (se.id = any (v_keep_exercises))
      and exists (select 1 from public.workout_sessions ws where ws.id = se.session_id and ws.user_id = v_user);
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
      or datetime_field_overflow or invalid_parameter_value then
      if sqlstate = '22023' then raise; end if;
      raise exception 'workout payload contains an invalid value' using errcode = '22023';
  end;
  return v_workout_id;
end;
$$;

revoke all on function public.sync_workout_graph(jsonb) from public, anon;
grant execute on function public.sync_workout_graph(jsonb) to authenticated;

create or replace function public.sync_workout_graphs(p_workouts jsonb)
returns integer
language plpgsql
security definer set search_path = pg_catalog, public, auth
as $$
declare
  v_workout jsonb;
  v_count integer := 0;
  v_total_sets bigint;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_workouts is null or jsonb_typeof(p_workouts) <> 'array' or jsonb_array_length(p_workouts) > 100 then
    raise exception 'workouts must be an array of at most 100 entries' using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(e.value -> 'sets')), 0) into v_total_sets
  from jsonb_array_elements(p_workouts) w,
       jsonb_array_elements(case when jsonb_typeof(w.value -> 'exercises') = 'array' then w.value -> 'exercises' else '[]'::jsonb end) e
  where jsonb_typeof(e.value -> 'sets') = 'array';
  if v_total_sets > 10000 then raise exception 'too many sets in one sync' using errcode = '22023'; end if;
  for v_workout in select value from jsonb_array_elements(p_workouts) loop
    perform public.sync_workout_graph(v_workout);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.sync_workout_graphs(jsonb) from public, anon;
grant execute on function public.sync_workout_graphs(jsonb) to authenticated;
