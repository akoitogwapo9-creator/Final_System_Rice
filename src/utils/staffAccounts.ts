import { supabase } from '../supabase';
import type { LftAccount } from '../types';

async function requestStaffAccount(body: object, token?: string) {
  const response = await fetch('/api/staff-accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Staff account service is unavailable.');
  return result;
}

export async function provisionLftAccount(account: Omit<LftAccount, 'id'>, password: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in as Central Admin.');
  const { id } = await requestStaffAccount({ ...account, password, action: 'create' }, session.access_token);
  return id;
}

export async function signInLftByUsername(username: string, password: string) {
  const result = await requestStaffAccount({ action: 'signIn', username, password });
  return supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
}
