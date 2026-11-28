BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Municipal Administrator',
  title text NOT NULL DEFAULT 'Municipal Agriculture Administrator',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.lft_technicians (
  id text PRIMARY KEY,
  username text NOT NULL,
  name text NOT NULL
);

-- Upgrade the existing roster in place to preserve IDs and barangay assignments.
ALTER TABLE public.lft_technicians
  ADD COLUMN IF NOT EXISTS username text DEFAULT '',
  ADD COLUMN IF NOT EXISTS name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS barangay text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_barangays text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS terrain text DEFAULT '',
  ADD COLUMN IF NOT EXISTS area_ha numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Certified Field LFT (Active)',
  ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS puroks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lft_technicians_auth_user_id_idx ON public.lft_technicians (auth_user_id);
CREATE INDEX IF NOT EXISTS lft_technicians_email_idx ON public.lft_technicians (lower(btrim(email)));

-- Link the existing, verified Central Admin identity if the project owner has provisioned it.
INSERT INTO public.admin_accounts (auth_user_id)
SELECT id FROM auth.users
WHERE lower(email) = 'admin@gmail.com'
  AND email_confirmed_at IS NOT NULL
  AND NOT coalesce(is_anonymous, false)
ON CONFLICT (auth_user_id) DO NOTHING;

ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_accounts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registry_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
    AND EXISTS (
      SELECT 1 FROM public.admin_accounts WHERE auth_user_id = auth.uid() AND active
    );
$$;

CREATE OR REPLACE FUNCTION public.registry_lft_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(t.id::text) ELSE NULL END
  FROM public.lft_technicians AS t
  JOIN auth.users AS u ON u.id = auth.uid() AND NOT coalesce(u.is_anonymous, false)
  WHERE t.auth_user_id = u.id
    OR (t.auth_user_id IS NULL AND u.email_confirmed_at IS NOT NULL
      AND nullif(lower(btrim(t.email)), '') = lower(u.email));
$$;

CREATE OR REPLACE FUNCTION public.registry_staff_account()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN public.registry_is_admin() THEN (
    SELECT jsonb_build_object('role', 'Central Admin', 'id', auth_user_id, 'name', name, 'title', title, 'username', 'admin')
    FROM public.admin_accounts WHERE auth_user_id = auth.uid()
  ) ELSE (
    SELECT jsonb_build_object(
      'role', 'Barangay Focal Person', 'id', id, 'name', name, 'username', username,
      'barangay', barangay, 'assigned_barangays', assigned_barangays, 'status', status,
      'email', email, 'contact_number', contact_number, 'photo_url', photo_url
    )
    FROM public.lft_technicians WHERE id::text = public.registry_lft_id()
      AND lower(btrim(coalesce(status, ''))) !~ 'inactive|disabled|pending|deactivated|suspended|revoked|^off$'
  ) END;
$$;

REVOKE ALL ON FUNCTION public.registry_is_admin(), public.registry_lft_id(), public.registry_staff_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_is_admin(), public.registry_lft_id(), public.registry_staff_account() TO authenticated;

ALTER TABLE public.lft_technicians ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lft_technicians FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, username, name, barangay, assigned_barangays, contact_number, email, terrain, area_ha, status, photo_url, puroks)
  ON public.lft_technicians TO authenticated;
GRANT INSERT (id, username, name, barangay, assigned_barangays, contact_number, email, terrain, area_ha, status, photo_url, puroks),
      UPDATE (id, username, name, barangay, assigned_barangays, contact_number, email, terrain, area_ha, status, photo_url, puroks),
      DELETE ON public.lft_technicians TO authenticated;

DROP POLICY IF EXISTS registry_roster_guard ON public.lft_technicians;
CREATE POLICY registry_roster_guard ON public.lft_technicians AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.registry_is_admin() OR id::text = public.registry_lft_id());
DROP POLICY IF EXISTS registry_roster_read ON public.lft_technicians;
CREATE POLICY registry_roster_read ON public.lft_technicians FOR SELECT TO authenticated USING (true);

-- Restrictive write policies take precedence over legacy broad grants.
DO $$
DECLARE operation text;
BEGIN
  FOREACH operation IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lft_technicians', 'registry_roster_' || operation);
    EXECUTE format('CREATE POLICY %I ON public.lft_technicians AS RESTRICTIVE FOR %s TO authenticated %s',
      'registry_roster_' || operation, operation, CASE operation
        WHEN 'insert' THEN 'WITH CHECK (public.registry_is_admin())'
        WHEN 'update' THEN 'USING (public.registry_is_admin()) WITH CHECK (public.registry_is_admin())'
        ELSE 'USING (public.registry_is_admin())'
      END);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS registry_roster_admin ON public.lft_technicians;
CREATE POLICY registry_roster_admin ON public.lft_technicians FOR ALL TO authenticated
  USING (public.registry_is_admin()) WITH CHECK (public.registry_is_admin());

CREATE OR REPLACE FUNCTION public.registry_update_lft_profile(display_name text, phone text, photo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.lft_technicians
  SET name = coalesce(nullif(btrim(display_name), ''), name),
      contact_number = coalesce(phone, contact_number),
      photo_url = coalesce(photo, photo_url)
  WHERE id::text = public.registry_lft_id()
    AND lower(btrim(coalesce(status, ''))) !~ 'inactive|disabled|pending|deactivated|suspended|revoked|^off$';
$$;

REVOKE ALL ON FUNCTION public.registry_update_lft_profile(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_update_lft_profile(text, text, text) TO authenticated;

-- Keep public reads as configured. Restrict registry writes to provisioned, active staff.
DO $$
DECLARE
  relation_name text;
  operation text;
  staff_check constant text := '(public.registry_staff_account() IS NOT NULL)';
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['farmers', 'farms', 'system_settings', 'app_settings'] LOOP
    IF to_regclass(format('public.%I', relation_name)) IS NULL THEN CONTINUE; END IF;
    FOREACH operation IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'registry_staff_' || operation, relation_name);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'registry_staff_' || operation, relation_name, operation, CASE operation
          WHEN 'insert' THEN 'WITH CHECK ' || staff_check
          WHEN 'update' THEN 'USING ' || staff_check || ' WITH CHECK ' || staff_check
          ELSE 'USING ' || staff_check
        END);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
