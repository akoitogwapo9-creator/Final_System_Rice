export const DEFAULT_ADMIN_EMAIL = 'admin@gmail.com';
const CENTRAL_ADMIN_EMAILS = new Set([DEFAULT_ADMIN_EMAIL, 'akoitogwapo9@gmail.com']);

export function isVerifiedAdminEmail(user: {
  email?: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
}): boolean {
  return Boolean(user.email_confirmed_at && !user.is_anonymous &&
    CENTRAL_ADMIN_EMAILS.has(user.email?.trim().toLowerCase() || ''));
}
