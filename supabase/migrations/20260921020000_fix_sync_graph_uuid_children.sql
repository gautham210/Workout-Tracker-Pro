-- session_exercises.id and sets.id are UUID columns in the deployed legacy
-- schema. The public graph payload represents them as UUID strings, so cast at
-- the database boundary before comparisons and writes.
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

revoke all on function public.sync_workout_graph(jsonb) from public, anon;
grant execute on function public.sync_workout_graph(jsonb) to authenticated;
