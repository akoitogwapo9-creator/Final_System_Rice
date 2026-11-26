ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS seasonal_records jsonb NOT NULL DEFAULT '[]'::jsonb;
