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

-- Run this in your Supabase SQL Editor to support the Intelligent Streak Engine & Analytics
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rest_days TEXT[] DEFAULT ARRAY['Sunday'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS include_rest_days BOOLEAN DEFAULT false;

-- Support for Active Duration Tracking
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC DEFAULT 0;
