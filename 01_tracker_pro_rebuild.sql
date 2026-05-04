-- 1. Profiles Table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_loop JSONB DEFAULT NULL;

-- Enable RLS everywhere
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyweight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts (ignoring errors if they don't exist)
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'workout_sessions', 'session_exercises', 'sets', 'bodyweight_logs', 'exercises')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 3. PROFILES POLICIES (Trigger handles INSERT)
CREATE POLICY "Profiles: Select Own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles: Update Own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 4. WORKOUT SESSIONS
CREATE POLICY "Sessions: All Own" ON public.workout_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. SESSION EXERCISES
CREATE POLICY "Session Exercises: All Own" ON public.session_exercises FOR ALL USING (
  EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid())
);

-- 6. SETS
CREATE POLICY "Sets: All Own" ON public.sets FOR ALL USING (
  EXISTS (
    SELECT 1 FROM session_exercises se 
    JOIN workout_sessions ws ON ws.id = se.session_id 
    WHERE se.id = session_exercise_id AND ws.user_id = auth.uid()
  )
);

-- 7. BODYWEIGHT LOGS
CREATE POLICY "Bodyweight: All Own" ON public.bodyweight_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. EXERCISES (Global Catalog)
CREATE POLICY "Exercises: Read All" ON public.exercises FOR SELECT USING (true);
