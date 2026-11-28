INSERT INTO public.admin_accounts (auth_user_id)
SELECT id FROM auth.users
WHERE lower(email) = 'akoitogwapo9@gmail.com'
  AND email_confirmed_at IS NOT NULL
  AND NOT coalesce(is_anonymous, false)
ON CONFLICT (auth_user_id) DO NOTHING;
