-- Run in the Supabase SQL Editor for project fzimfyncnshbnyuzncfz.
-- Repairs Central Admin role lookup without changing passwords or LFT records.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Municipal Administrator',
  title text NOT NULL DEFAULT 'Municipal Agriculture Administrator',
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_accounts FROM PUBLIC, anon, authenticated;

DO $repair$
BEGIN
  INSERT INTO public.admin_accounts (auth_user_id)
  SELECT id
  FROM auth.users
  WHERE lower(email) IN ('admin@gmail.com', 'akoitogwapo9@gmail.com')
    AND email_confirmed_at IS NOT NULL
    AND NOT coalesce(is_anonymous, false)
  ON CONFLICT (auth_user_id) DO NOTHING;

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.admin_accounts AS a
    JOIN auth.users AS u ON u.id = a.auth_user_id
    WHERE lower(u.email) IN ('admin@gmail.com', 'akoitogwapo9@gmail.com')
      AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false)
  ) THEN
    RAISE EXCEPTION 'Neither configured admin email has a verified Auth user in this project.';
  END IF;

  -- Keep the full staff lookup when it already exists.
  IF to_regprocedure('public.registry_staff_account()') IS NULL THEN
    EXECUTE $statement$
      CREATE FUNCTION public.registry_staff_account()
      RETURNS jsonb
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $body$
        SELECT jsonb_build_object(
          'role', 'Central Admin', 'id', auth_user_id, 'name', name,
          'title', title, 'username', 'admin'
        )
        FROM public.admin_accounts
        WHERE auth_user_id = auth.uid()
          AND active
          AND coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
      $body$
    $statement$;
  END IF;
END;
$repair$;

REVOKE ALL ON FUNCTION public.registry_staff_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registry_staff_account() TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT u.email, a.active AS admin_active,
       has_function_privilege('authenticated', 'public.registry_staff_account()', 'EXECUTE') AS staff_lookup_enabled
FROM public.admin_accounts AS a
JOIN auth.users AS u ON u.id = a.auth_user_id
WHERE lower(u.email) IN ('admin@gmail.com', 'akoitogwapo9@gmail.com');
