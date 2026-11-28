-- Permit registration records without planting details. Existing rows are preserved.
DO $$
DECLARE
  table_name text;
  column_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['farmers', 'farms'] LOOP
    FOREACH column_name IN ARRAY ARRAY[
      'variety', 'seed_type', 'tenure', 'ecosystem', 'cropping_season',
      'irrigation_association', 'planting_date', 'harvest_date', 'target_yield_mt'
    ] LOOP
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = table_name
          AND c.relkind IN ('r', 'p') AND a.attname = column_name
          AND a.attnum > 0 AND NOT a.attisdropped
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT, ALTER COLUMN %I DROP NOT NULL',
          table_name, column_name, column_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
