BEGIN;

CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS seasonal_records jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS farm_label text,
  ADD COLUMN IF NOT EXISTS farmer_group_id text,
  ADD COLUMN IF NOT EXISTS boundary_coords jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS irrigation_association text,
  ADD COLUMN IF NOT EXISTS parcel_verification_status text NOT NULL DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS parcel_verified_by text,
  ADD COLUMN IF NOT EXISTS parcel_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS farmer_verification_status text NOT NULL DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS farmer_verified_by text,
  ADD COLUMN IF NOT EXISTS farmer_verified_at timestamptz;

CREATE OR REPLACE FUNCTION registry_private.reference_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT nullif(nullif(regexp_replace(regexp_replace(upper(btrim(value)),
    '^RSBSA[ -]+', ''), '\s*-\s*', '-', 'g'), ''), 'NO RSBSA');
$$;

WITH groups AS (
  SELECT id, coalesce(registry_private.reference_key(rsbsa_number), id) AS key
  FROM public.farmers
), numbered AS (
  SELECT id, key, row_number() OVER (PARTITION BY key ORDER BY id) AS number FROM groups
)
UPDATE public.farmers f SET farmer_group_id = n.key, farm_label = 'Farm ' || n.number
FROM numbered n WHERE n.id = f.id AND f.farmer_group_id IS NULL;

ALTER TABLE public.farmers
  ALTER COLUMN farm_label SET DEFAULT 'Farm 1',
  ALTER COLUMN farm_label SET NOT NULL,
  ALTER COLUMN farmer_group_id SET NOT NULL,
  ADD CONSTRAINT registry_farm_label_format CHECK (farm_label ~ '^Farm [1-9][0-9]*$'),
  ADD CONSTRAINT registry_parcel_review_status CHECK
    (parcel_verification_status IN ('Pending Verification','Verified by MAO','Flagged / Needs Revision')),
  ADD CONSTRAINT registry_farmer_review_status CHECK
    (farmer_verification_status IN ('Pending Verification','Verified by MAO','Flagged / Needs Revision'));

CREATE UNIQUE INDEX registry_farmer_parcel_number ON public.farmers (farmer_group_id, farm_label);

CREATE OR REPLACE FUNCTION registry_private.boundary_key(boundary jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$
  SELECT md5(string_agg(DISTINCT point::text, '|' ORDER BY point::text))
  FROM jsonb_array_elements(boundary) AS vertices(point);
$$;

CREATE UNIQUE INDEX registry_boundary_unique ON public.farmers (registry_private.boundary_key(boundary_coords))
WHERE boundary_coords IS NOT NULL;

CREATE TABLE public.registry_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text NOT NULL,
  target_table text NOT NULL,
  target_id text NOT NULL,
  action text NOT NULL
);
ALTER TABLE public.registry_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registry_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registry_activity TO authenticated;
CREATE POLICY registry_audit_admin_read ON public.registry_activity FOR SELECT TO authenticated
  USING (public.registry_is_admin());

CREATE FUNCTION registry_private.audit_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  action text := TG_OP;
BEGIN
  IF TG_TABLE_NAME = 'farmers' AND TG_OP = 'UPDATE' THEN
    IF (OLD.parcel_verification_status, OLD.parcel_verified_at, OLD.farmer_verification_status, OLD.farmer_verified_at)
       IS DISTINCT FROM
       (NEW.parcel_verification_status, NEW.parcel_verified_at, NEW.farmer_verification_status, NEW.farmer_verified_at) THEN
      action := 'VERIFY';
    END IF;
  END IF;
  INSERT INTO public.registry_activity (actor_id, actor_name, target_table, target_id, action)
  VALUES (auth.uid(), coalesce(public.registry_staff_account() ->> 'name', 'System'),
    TG_TABLE_NAME, coalesce(data ->> 'id', data ->> 'key', data ->> 'auth_user_id', ''), action);
  RETURN NULL;
END;
$$;

CREATE FUNCTION registry_private.guard_parcel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  prior public.farmers%ROWTYPE;
  reference text := registry_private.reference_key(NEW.rsbsa_number);
  known_farmer boolean;
BEGIN
  NEW.farmer_group_id := coalesce(nullif(NEW.farmer_group_id, ''), reference, NEW.id);
  IF reference IS NOT NULL AND reference <> NEW.farmer_group_id THEN
    RAISE EXCEPTION 'The parcel farmer group must match its RSBSA reference.' USING ERRCODE = '23514';
  END IF;
  IF NEW.boundary_coords IS NOT NULL THEN
    IF jsonb_typeof(NEW.boundary_coords) <> 'array' OR EXISTS (
      SELECT FROM jsonb_array_elements(NEW.boundary_coords) AS vertices(point)
      WHERE jsonb_typeof(point) <> 'array' OR jsonb_array_length(point) <> 2
        OR jsonb_typeof(point -> 0) <> 'number' OR jsonb_typeof(point -> 1) <> 'number'
        OR abs((point ->> 0)::numeric) > 90 OR abs((point ->> 1)::numeric) > 180
    ) OR (SELECT count(DISTINCT point) FROM jsonb_array_elements(NEW.boundary_coords) AS vertices(point)) < 3 THEN
      RAISE EXCEPTION 'The GIS boundary requires at least three distinct, valid coordinate pairs.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.farmer_group_id IS DISTINCT FROM OLD.farmer_group_id OR NEW.farm_label IS DISTINCT FROM OLD.farm_label THEN
      RAISE EXCEPTION 'The parcel number and farmer group are fixed after registration.' USING ERRCODE = '23514';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.farmer_group_id, 0));
    SELECT * INTO prior FROM public.farmers WHERE farmer_group_id = NEW.farmer_group_id
      ORDER BY farmer_verified_at DESC NULLS LAST, id LIMIT 1;
    known_farmer := FOUND;
    IF NOT known_farmer AND reference IS NOT NULL AND reference !~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}-[0-9]{6}$' THEN
      RAISE EXCEPTION 'Invalid RSBSA reference format.' USING ERRCODE = '23514';
    END IF;
    IF known_farmer AND (lower(btrim(prior.farmer_name)) IS DISTINCT FROM lower(btrim(NEW.farmer_name))
          OR coalesce(prior.birthday, '') <> coalesce(NEW.birthday, '')) THEN
      RAISE EXCEPTION 'The farmer identity does not match the existing group.' USING ERRCODE = '23505';
    END IF;
    IF NOT known_farmer AND NEW.farmer_group_id <> coalesce(reference, NEW.id) THEN
      RAISE EXCEPTION 'The existing farmer group could not be found.' USING ERRCODE = '23514';
    END IF;
    IF NOT known_farmer AND nullif(btrim(NEW.birthday), '') IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(NEW.farmer_name)) || '/' || NEW.birthday, 1));
      IF EXISTS (SELECT FROM public.farmers WHERE lower(btrim(farmer_name)) = lower(btrim(NEW.farmer_name))
                   AND birthday = NEW.birthday AND farmer_group_id <> NEW.farmer_group_id) THEN
        RAISE EXCEPTION 'A farmer with this name and birth date already exists.' USING ERRCODE = '23505';
      END IF;
    END IF;
    NEW.parcel_verification_status := 'Pending Verification';
    NEW.parcel_verified_by := NULL;
    NEW.parcel_verified_at := NULL;
    NEW.farmer_verification_status := coalesce(prior.farmer_verification_status, 'Pending Verification');
    NEW.farmer_verified_by := prior.farmer_verified_by;
    NEW.farmer_verified_at := prior.farmer_verified_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER registry_parcel_guard BEFORE INSERT OR UPDATE ON public.farmers
FOR EACH ROW EXECUTE FUNCTION registry_private.guard_parcel();

REVOKE ALL ON public.farmers FROM PUBLIC, anon;
REVOKE INSERT, UPDATE ON public.farmers FROM authenticated;
GRANT SELECT, DELETE ON public.farmers TO authenticated;
GRANT INSERT (id, rsbsa_number, farmer_name, barangay, contact_number, lat, lng, area_ha, address, purok, birthday,
  variety, seed_type, ecosystem, tenure, cropping_season, planting_date, harvest_date, photo_url, field_photo_url,
  sync_status, seasonal_records, farm_label, farmer_group_id, boundary_coords, custom_fields, is_archived, irrigation_association),
  UPDATE (id, rsbsa_number, farmer_name, barangay, contact_number, lat, lng, area_ha, address, purok, birthday,
  variety, seed_type, ecosystem, tenure, cropping_season, planting_date, harvest_date, photo_url, field_photo_url,
  sync_status, seasonal_records, farm_label, farmer_group_id, boundary_coords, custom_fields, is_archived, irrigation_association)
  ON public.farmers TO authenticated;
DROP POLICY IF EXISTS "Public farmers access" ON public.farmers;
CREATE POLICY registry_staff_parcels ON public.farmers FOR ALL TO authenticated
  USING (public.registry_can_access_barangay(barangay)) WITH CHECK (public.registry_can_access_barangay(barangay));
CREATE POLICY registry_parcel_admin_delete ON public.farmers AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.registry_is_admin()));

CREATE FUNCTION registry_private.set_verification(parcel_id text, verification_scope text, status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  group_id text;
  verifier text := public.registry_staff_account() ->> 'name';
BEGIN
  IF auth.uid() IS NULL OR NOT public.registry_is_admin() THEN
    RAISE EXCEPTION 'MAO administrator approval is required.' USING ERRCODE = '42501';
  END IF;
  SELECT farmer_group_id INTO STRICT group_id FROM public.farmers WHERE id = parcel_id;
  IF verification_scope = 'farmer' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(group_id, 0));
    UPDATE public.farmers SET farmer_verification_status = status, farmer_verified_by = verifier,
      farmer_verified_at = now() WHERE farmer_group_id = group_id;
  ELSIF verification_scope = 'parcel' THEN
    UPDATE public.farmers SET parcel_verification_status = status, parcel_verified_by = verifier,
      parcel_verified_at = now() WHERE id = parcel_id;
  ELSE
    RAISE EXCEPTION 'Choose farmer or parcel verification.';
  END IF;
END;
$$;

CREATE FUNCTION public.registry_set_verification(parcel_id text, verification_scope text, status text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT registry_private.set_verification(parcel_id, verification_scope, status); $$;

GRANT USAGE ON SCHEMA registry_private TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA registry_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registry_private.set_verification(text, text, text),
  registry_private.boundary_key(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.registry_set_verification(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_set_verification(text, text, text) TO authenticated;

CREATE TABLE public.registry_stock (
  item text NOT NULL CHECK (btrim(item) <> ''),
  category text NOT NULL CHECK (category IN ('Seed', 'Fertilizer')),
  unit text NOT NULL CHECK (unit IN ('kg', 'bag', 'pack', 'L')),
  quantity numeric NOT NULL CHECK (quantity >= 0 AND quantity < 'Infinity'::numeric),
  PRIMARY KEY (item, category, unit)
);

CREATE TABLE public.registry_distribution (
  id uuid PRIMARY KEY,
  entry_type text NOT NULL CHECK (entry_type IN ('Restock','Request','Release')),
  parcel_id text REFERENCES public.farmers (id) ON DELETE RESTRICT,
  farm_label text,
  farmer_name text,
  barangay text,
  season text NOT NULL DEFAULT '',
  item text NOT NULL CHECK (btrim(item) <> ''),
  category text NOT NULL CHECK (category IN ('Seed','Fertilizer')),
  unit text NOT NULL CHECK (unit IN ('kg','bag','pack','L')),
  quantity numeric NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  acknowledgment text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text,
  CHECK ((entry_type = 'Restock' AND parcel_id IS NULL) OR
         (entry_type <> 'Restock' AND parcel_id IS NOT NULL AND btrim(season) <> ''))
);
CREATE INDEX registry_distribution_parcel_idx ON public.registry_distribution (parcel_id);

ALTER TABLE public.registry_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_distribution ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registry_stock, public.registry_distribution FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registry_stock, public.registry_distribution TO authenticated;
GRANT INSERT (id, entry_type, parcel_id, season, item, category, unit, quantity, acknowledgment)
  ON public.registry_distribution TO authenticated;

CREATE POLICY registry_stock_staff_read ON public.registry_stock FOR SELECT TO authenticated
  USING ((SELECT public.registry_staff_account()) IS NOT NULL);
CREATE POLICY registry_distribution_read ON public.registry_distribution FOR SELECT TO authenticated
  USING ((SELECT public.registry_is_admin()) OR public.registry_can_access_barangay(barangay));
CREATE POLICY registry_distribution_insert ON public.registry_distribution FOR INSERT TO authenticated
  WITH CHECK ((entry_type = 'Restock' AND (SELECT public.registry_is_admin())) OR
    (entry_type <> 'Restock' AND public.registry_can_access_barangay(barangay)));

CREATE FUNCTION registry_private.record_distribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  parcel public.farmers%ROWTYPE;
BEGIN
  NEW.recorded_by := public.registry_staff_account() ->> 'name';
  IF auth.uid() IS NULL OR NEW.recorded_by IS NULL THEN
    RAISE EXCEPTION 'An active staff account is required.' USING ERRCODE = '42501';
  END IF;
  NEW.recorded_at := now();
  NEW.item := upper(regexp_replace(btrim(NEW.item), '\s+', ' ', 'g'));
  IF NEW.entry_type = 'Restock' THEN
    IF NOT public.registry_is_admin() THEN
      RAISE EXCEPTION 'Only the MAO administrator may receive municipal stock.' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO STRICT parcel FROM public.farmers WHERE id = NEW.parcel_id AND NOT is_archived;
    IF NOT public.registry_can_access_barangay(parcel.barangay) THEN
      RAISE EXCEPTION 'The farm parcel is outside your assignment.' USING ERRCODE = '42501';
    END IF;
    NEW.farm_label := parcel.farm_label;
    NEW.farmer_name := parcel.farmer_name;
    NEW.barangay := parcel.barangay;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION registry_private.update_stock_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.entry_type = 'Restock' THEN
    INSERT INTO public.registry_stock (item, category, unit, quantity)
    VALUES (NEW.item, NEW.category, NEW.unit, NEW.quantity)
    ON CONFLICT (item, category, unit) DO UPDATE SET quantity = registry_stock.quantity + EXCLUDED.quantity;
  ELSIF NEW.entry_type = 'Release' THEN
    UPDATE public.registry_stock SET quantity = quantity - NEW.quantity
    WHERE (item, category, unit) = (NEW.item, NEW.category, NEW.unit) AND quantity >= NEW.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient municipal stock for this item and unit.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER registry_distribution_prepare BEFORE INSERT ON public.registry_distribution
FOR EACH ROW EXECUTE FUNCTION registry_private.record_distribution();
CREATE TRIGGER registry_distribution_stock AFTER INSERT ON public.registry_distribution
FOR EACH ROW EXECUTE FUNCTION registry_private.update_stock_balance();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['farmers','registry_distribution','lft_technicians','admin_accounts','system_settings','app_settings'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER registry_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION registry_private.audit_activity()', table_name);
    END IF;
  END LOOP;
END;
$$;

-- Keep published site settings readable while controlling office data and writes.
DO $$
DECLARE
  table_name text;
  operation text;
  private_keys text := 'ARRAY[''silago_subsidy_programs'', ''silago_subsidy_claims'', ''silago_subsidy_history'']';
BEGIN
  FOREACH table_name IN ARRAY ARRAY['system_settings', 'app_settings'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon', table_name);
    EXECUTE format('CREATE POLICY registry_private_settings_anon ON public.%I AS RESTRICTIVE FOR SELECT TO anon
      USING (key <> ALL (%s))', table_name, private_keys);
    EXECUTE format('CREATE POLICY registry_private_settings_staff ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
      USING (key <> ALL (%s) OR (SELECT public.registry_is_admin()))', table_name, private_keys);
    FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('CREATE POLICY registry_settings_admin_%s ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        lower(operation), table_name, operation,
        CASE operation WHEN 'INSERT' THEN 'WITH CHECK ((SELECT public.registry_is_admin()))'
        WHEN 'UPDATE' THEN 'USING ((SELECT public.registry_is_admin())) WITH CHECK ((SELECT public.registry_is_admin()))'
        ELSE 'USING ((SELECT public.registry_is_admin()))' END);
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') AND
     NOT EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'farmers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.farmers;
  END IF;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA registry_private FROM PUBLIC, anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
