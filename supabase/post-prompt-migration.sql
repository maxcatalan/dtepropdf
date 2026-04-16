-- Add post_prompt column to extraction_configs for per-template result transformation
ALTER TABLE public.extraction_configs
  ADD COLUMN IF NOT EXISTS post_prompt text NOT NULL DEFAULT '';
