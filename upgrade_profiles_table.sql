-- Run this in your Supabase SQL Editor to upgrade the profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
