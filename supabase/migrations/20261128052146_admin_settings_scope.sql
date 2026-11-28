BEGIN;

DO $$
DECLARE
  relation_name text;
  operation text;
  admin_keys constant text[] := ARRAY[
    'silago_registry_preferences_v1',
    'silago_barangay_profiles',
    'silago_municipal_branding',
    'silago_municipal_settings',
    'silago_office_contact_info',
    'silago_landing_page_config',
    'silago_language',
    'silago_bg_photo_url',
    'silago_bg_opacity',
    'silago_bg_blur',
    'silago_bg_active',
    'silago_bg_history',
    'silago_da_logo_url',
    'silago_seal_url',
    'silago_bag_ong_logo_url',
    'silago_slsu_photo_url',
    'silago_slsu_center_title',
    'silago_slsu_center_subtitle',
    'silago_slsu_caption',
    'silago_slsu_motto'
  ];
  access_check text := format('(key <> ALL (%L::text[]) OR public.registry_is_admin())', admin_keys);
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['system_settings', 'app_settings'] LOOP
    IF to_regclass(format('public.%I', relation_name)) IS NULL THEN CONTINUE; END IF;

    FOREACH operation IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'registry_admin_settings_' || operation, relation_name);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'registry_admin_settings_' || operation, relation_name, operation, CASE operation
          WHEN 'insert' THEN 'WITH CHECK ' || access_check
          WHEN 'update' THEN 'USING ' || access_check || ' WITH CHECK ' || access_check
          ELSE 'USING ' || access_check
        END);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
