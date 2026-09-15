-- Enable RLS on all tables
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodyweight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- 1. workout_sessions (Direct Ownership)
DROP POLICY IF EXISTS "Users can manage their own workout sessions" ON workout_sessions;
CREATE POLICY "Users can manage their own workout sessions"
  ON workout_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. session_exercises (Indirect Ownership via workout_sessions)
DROP POLICY IF EXISTS "Users can manage session exercises for their sessions" ON session_exercises;
CREATE POLICY "Users can manage session exercises for their sessions"
  ON session_exercises
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM workout_sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM workout_sessions WHERE user_id = auth.uid()
    )
  );

-- 3. sets (Indirect Ownership via session_exercises -> workout_sessions)
DROP POLICY IF EXISTS "Users can manage sets for their session exercises" ON sets;
CREATE POLICY "Users can manage sets for their session exercises"
  ON sets
  FOR ALL
  USING (
    session_exercise_id IN (
      SELECT se.id FROM session_exercises se
      JOIN workout_sessions ws ON se.session_id = ws.id
      WHERE ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_exercise_id IN (
      SELECT se.id FROM session_exercises se
      JOIN workout_sessions ws ON se.session_id = ws.id
      WHERE ws.user_id = auth.uid()
    )
  );

-- 4. bodyweight_logs (Direct Ownership)
DROP POLICY IF EXISTS "Users can manage their own bodyweight logs" ON bodyweight_logs;
CREATE POLICY "Users can manage their own bodyweight logs"
  ON bodyweight_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. exercises (Global Read-Only for authenticated users)
DROP POLICY IF EXISTS "Anyone authenticated can read exercises" ON exercises;
CREATE POLICY "Anyone authenticated can read exercises"
  ON exercises
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- P1: Add RPE/RIR to sets
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sets' AND column_name = 'rpe') THEN
    ALTER TABLE sets ADD COLUMN rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sets' AND column_name = 'rir') THEN
    ALTER TABLE sets ADD COLUMN rir INTEGER CHECK (rir >= 0);
  END IF;
END $$;
