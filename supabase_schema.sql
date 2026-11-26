ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS seasonal_records jsonb NOT NULL DEFAULT '[]'::jsonb;

BEGIN;

-- Keep existing SELECT grants and policies for public views.
-- Restrictive policies also cover projects with permissive legacy write policies.
DO $$
DECLARE
  table_name text;
  operation text;
  expression text := '(auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> ''is_anonymous'', ''false'') <> ''true'')';
BEGIN
  FOREACH table_name IN ARRAY ARRAY['farmers', 'farms', 'lft_technicians', 'system_settings', 'app_settings']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.%I FROM anon, PUBLIC',
      table_name
    );

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(format('public.%I', table_name))) THEN
      -- Preserve the existing access of authenticated accounts on tables that previously used grants alone.
      EXECUTE format('CREATE POLICY existing_public_reads ON public.%I FOR SELECT TO PUBLIC USING (true)', table_name);
      EXECUTE format('CREATE POLICY existing_authenticated_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;

    FOREACH operation IN ARRAY ARRAY['insert', 'update', 'delete']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'signed_in_' || operation, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO PUBLIC %s',
        'signed_in_' || operation, table_name, operation,
        CASE operation
          WHEN 'insert' THEN 'WITH CHECK ' || expression
          WHEN 'update' THEN 'USING ' || expression || ' WITH CHECK ' || expression
          ELSE 'USING ' || expression
        END
      );
    END LOOP;
  END LOOP;
END
$$;

-- Restrict guest uploads and edits to this app's bucket while preserving other buckets.
DROP POLICY IF EXISTS farm_photos_signed_in_insert ON storage.objects;
CREATE POLICY farm_photos_signed_in_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id <> 'farm-photos' OR (auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'));

DROP POLICY IF EXISTS farm_photos_signed_in_update ON storage.objects;
CREATE POLICY farm_photos_signed_in_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id <> 'farm-photos' OR (auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'))
  WITH CHECK (bucket_id <> 'farm-photos' OR (auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'));

DROP POLICY IF EXISTS farm_photos_signed_in_delete ON storage.objects;
CREATE POLICY farm_photos_signed_in_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id <> 'farm-photos' OR (auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'));

COMMIT;
