-- ============================================================
-- TRACKER PRO: COMPLETE SCHEMA + RLS FIX
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- STEP 1: Ensure all required profile columns exist
-- These were missing from the original create_profiles_table.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS include_rest_days BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rest_days TEXT[] DEFAULT ARRAY['Sunday'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_loop JSONB DEFAULT NULL;

-- STEP 2: Enable RLS on every table (safe to run even if already enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyweight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- STEP 3: Drop ALL existing policies to remove conflicts
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('profiles', 'workout_sessions', 'session_exercises', 'sets', 'bodyweight_logs', 'exercises')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- STEP 4: PROFILES policies
-- INSERT allowed so frontend can recover missing profiles for pre-trigger users
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- STEP 5: WORKOUT SESSIONS
CREATE POLICY "sessions_all_own" ON public.workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STEP 6: SESSION EXERCISES (inherits security via session ownership)
CREATE POLICY "session_exercises_all_own" ON public.session_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_sessions ws
      WHERE ws.id = session_id AND ws.user_id = auth.uid()
    )
  );

-- STEP 7: SETS (inherits security via session_exercise → session ownership)
CREATE POLICY "sets_all_own" ON public.sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.id = session_exercise_id AND ws.user_id = auth.uid()
    )
  );

-- STEP 8: BODYWEIGHT LOGS
CREATE POLICY "bodyweight_all_own" ON public.bodyweight_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STEP 9: EXERCISES — globally readable catalog
CREATE POLICY "exercises_read_all" ON public.exercises
  FOR SELECT USING (true);

-- STEP 10: Recreate the trigger function (with ON CONFLICT safety)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, include_rest_days, rest_days)
  VALUES (
    new.id,
    split_part(new.email, '@', 1),
    false,
    ARRAY['Sunday']
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DONE. Verify with:
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
-- SELECT id, name, include_rest_days, rest_days FROM public.profiles LIMIT 5;
