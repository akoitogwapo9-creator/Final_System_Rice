BEGIN;

GRANT SELECT (auth_user_id) ON public.lft_technicians TO authenticated;

-- Keep username lookup unambiguous for newly linked Auth users.
CREATE UNIQUE INDEX IF NOT EXISTS lft_linked_username_unique
  ON public.lft_technicians (lower(btrim(username))) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lft_linked_auth_user_unique
  ON public.lft_technicians (auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registry_barangay_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT regexp_replace(regexp_replace(lower(btrim(coalesce(value, ''))), '^(brgy\.?|barangay)[[:space:]]+', ''), '[^a-z0-9]', '', 'g') AS name
  )
  SELECT CASE
    WHEN name IN ('pd1', 'pob1', 'poblacion1', 'poblaciondistrict1', 'poblaciondistricti', 'pobdistricti') THEN 'poblaciondistrict1'
    WHEN name IN ('pd2', 'pob2', 'poblacion2', 'poblaciondistrict2', 'poblaciondistrictii', 'pobdistrictii') THEN 'poblaciondistrict2'
    WHEN name IN ('laguna', 'laguma') THEN 'laguna'
    ELSE name
  END
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.registry_can_access_barangay(name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH staff AS (SELECT public.registry_staff_account() AS account)
  SELECT coalesce(account ->> 'role' = 'Central Admin' OR (
    account ->> 'role' = 'Barangay Focal Person' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(account -> 'assigned_barangays') = 'array'
          AND account -> 'assigned_barangays' <> '[]'::jsonb THEN account -> 'assigned_barangays'
          ELSE to_jsonb(string_to_array(coalesce(account ->> 'barangay', ''), ','))
        END
      ) AS assigned(value)
      WHERE public.registry_barangay_key(assigned.value) <> ''
        AND public.registry_barangay_key(assigned.value) = public.registry_barangay_key(name)
    )
  ), false)
  FROM staff;
$$;

REVOKE ALL ON FUNCTION public.registry_can_access_barangay(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_can_access_barangay(text) TO authenticated;

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['farmers', 'farms'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = relation_name AND column_name = 'barangay'
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS scoped_staff_select ON public.%I', relation_name);
    EXECUTE format('CREATE POLICY scoped_staff_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
      USING (public.registry_can_access_barangay(barangay))', relation_name);

    EXECUTE format('DROP POLICY IF EXISTS scoped_staff_update ON public.%I', relation_name);
    EXECUTE format('CREATE POLICY scoped_staff_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.registry_can_access_barangay(barangay))
      WITH CHECK (public.registry_can_access_barangay(barangay))', relation_name);

    -- Upsert checks INSERT policies even when updating an existing parcel.
    EXECUTE format('DROP POLICY IF EXISTS scoped_staff_insert ON public.%I', relation_name);
    EXECUTE format('CREATE POLICY scoped_staff_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.registry_can_access_barangay(barangay))', relation_name);

    EXECUTE format('DROP POLICY IF EXISTS scoped_staff_delete ON public.%I', relation_name);
    EXECUTE format('CREATE POLICY scoped_staff_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.registry_is_admin())', relation_name);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
