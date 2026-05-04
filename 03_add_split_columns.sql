-- Add custom_split and active_loop columns if not already present
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_split TEXT[] DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_loop  JSONB  DEFAULT NULL;
