-- ============================================================================
-- SUPERSEDED. DO NOT RUN.
-- This file predates supabase/migrations/. Running it would weaken the deployed
-- schema: it recreates older, weaker RLS policies, and/or conflicts with the
-- canonical column types. The canonical, applied migration set is the only source
-- of truth.
--
-- This guard raises an exception unconditionally so that pasting this file into
-- the Supabase SQL Editor fails loudly instead of quietly reverting production.
-- Historical reference only.
-- ============================================================================
DO $$
BEGIN
  RAISE EXCEPTION
    'This script is superseded by supabase/migrations/ and must not be executed. '
    'See README.md in this folder for the migration that replaced it.';
END
$$;

-- Run this in your Supabase SQL Editor to fix the Exercise Search RLS bug

-- Ensure the public policy exists for exercises reading
DROP POLICY IF EXISTS "allow read exercises" ON public.exercises;

CREATE POLICY "allow read exercises"
ON public.exercises
FOR SELECT
USING (true);
