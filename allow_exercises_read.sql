-- Run this in your Supabase SQL Editor to fix the Exercise Search RLS bug

-- Ensure the public policy exists for exercises reading
DROP POLICY IF EXISTS "allow read exercises" ON public.exercises;

CREATE POLICY "allow read exercises"
ON public.exercises
FOR SELECT
USING (true);
