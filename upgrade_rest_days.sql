-- Run this in your Supabase SQL Editor to support the Intelligent Streak Engine & Analytics
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rest_days TEXT[] DEFAULT ARRAY['Sunday'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS include_rest_days BOOLEAN DEFAULT false;

-- Support for Active Duration Tracking
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC DEFAULT 0;
