-- Legacy hardening. This file sorts before the canonical 2026 migration, so on an
-- empty database none of these tables exist yet; every section is guarded and
-- becomes a no-op there. On the live database the effect is unchanged.
do $guard$
begin
  if to_regclass('public.workout_sessions') is not null then
    alter table public.workout_sessions enable row level security;
  end if;
  if to_regclass('public.session_exercises') is not null and to_regclass('public.workout_sessions') is not null then
    alter table public.session_exercises enable row level security;
  end if;
  if to_regclass('public.sets') is not null and to_regclass('public.session_exercises') is not null and to_regclass('public.workout_sessions') is not null then
    alter table public.sets enable row level security;
  end if;
  if to_regclass('public.bodyweight_logs') is not null then
    alter table public.bodyweight_logs enable row level security;
  end if;
  if to_regclass('public.exercises') is not null then
    alter table public.exercises enable row level security;
  end if;
end
$guard$;

-- 1. workout_sessions (Direct Ownership)
do $guard$
begin
  if to_regclass('public.workout_sessions') is not null then
  DROP POLICY IF EXISTS "Users can manage their own workout sessions" ON public.workout_sessions;
  CREATE POLICY "Users can manage their own workout sessions"
    ON public.workout_sessions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  end if;
end
$guard$;

-- 2. session_exercises (Indirect Ownership via workout_sessions)
do $guard$
begin
  if to_regclass('public.session_exercises') is not null and to_regclass('public.workout_sessions') is not null then
  DROP POLICY IF EXISTS "Users can manage session exercises for their sessions" ON public.session_exercises;
  CREATE POLICY "Users can manage session exercises for their sessions"
    ON public.session_exercises
    FOR ALL
    USING (
      session_id IN (
        SELECT id FROM public.workout_sessions WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      session_id IN (
        SELECT id FROM public.workout_sessions WHERE user_id = auth.uid()
      )
    );
  end if;
end
$guard$;

-- 3. sets (Indirect Ownership via session_exercises -> workout_sessions)
do $guard$
begin
  if to_regclass('public.sets') is not null and to_regclass('public.session_exercises') is not null and to_regclass('public.workout_sessions') is not null then
  DROP POLICY IF EXISTS "Users can manage sets for their session exercises" ON public.sets;
  CREATE POLICY "Users can manage sets for their session exercises"
    ON public.sets
    FOR ALL
    USING (
      session_exercise_id IN (
        SELECT se.id FROM public.session_exercises se
        JOIN public.workout_sessions ws ON se.session_id = ws.id
        WHERE ws.user_id = auth.uid()
      )
    )
    WITH CHECK (
      session_exercise_id IN (
        SELECT se.id FROM public.session_exercises se
        JOIN public.workout_sessions ws ON se.session_id = ws.id
        WHERE ws.user_id = auth.uid()
      )
    );
  end if;
end
$guard$;

-- 4. bodyweight_logs (Direct Ownership)
do $guard$
begin
  if to_regclass('public.bodyweight_logs') is not null then
  DROP POLICY IF EXISTS "Users can manage their own bodyweight logs" ON public.bodyweight_logs;
  CREATE POLICY "Users can manage their own bodyweight logs"
    ON public.bodyweight_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  end if;
end
$guard$;

-- 5. exercises (Global Read-Only for authenticated users)
do $guard$
begin
  if to_regclass('public.exercises') is not null then
  DROP POLICY IF EXISTS "Anyone authenticated can read exercises" ON public.exercises;
  CREATE POLICY "Anyone authenticated can read exercises"
    ON public.exercises
    FOR SELECT
    USING (auth.role() = 'authenticated');
  end if;
end
$guard$;

-- P1: Add RPE/RIR to sets
do $guard$
begin
  if to_regclass('public.sets') is null then return; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sets' and column_name = 'rpe') then
    alter table public.sets add column rpe integer check (rpe >= 1 and rpe <= 10);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sets' and column_name = 'rir') then
    alter table public.sets add column rir integer check (rir >= 0);
  end if;
end
$guard$;
