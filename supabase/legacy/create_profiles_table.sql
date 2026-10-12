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

-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  tagline TEXT,
  height_cm NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
