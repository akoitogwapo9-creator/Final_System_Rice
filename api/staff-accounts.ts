import { createClient } from '@supabase/supabase-js';
import { isVerifiedAdminEmail } from '../src/utils/adminIdentity.ts';
import { OFFICIAL_15_BARANGAYS } from '../src/data/officialBarangayNames.ts';
import { isAccountActive } from '../src/types.ts';

const validUsername = /^[a-z0-9][a-z0-9._-]{1,59}$/;
const reservedUsernames = new Set(['admin', 'administrator', 'mao', 'silago.test']);
const validEmail = /^[^s@]+@[^s@]+.[^s@]+$/;
const text = (value: unknown, maxLength = 240) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !secret || secret === 'your_supabase_secret_key_here') {
    return res.status(503).json({ error: 'Staff account service is unavailable. Configure the server Supabase credentials.' });
  }
  const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const auth = createClient(url, publicKey, authOptions);
  const service = createClient(url, secret, authOptions);
  const body = req.body || {};
  const username = text(body.username, 61).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  try {
    if (body.action === 'signIn') {
      const invalid = () => res.status(401).json({ error: 'Invalid username or password.' });
      if (!validUsername.test(username) || reservedUsernames.has(username) || !password || password.length > 1024) return invalid();
      const { data, error } = await service.from('lft_technicians')
        .select('email,status,auth_user_id').ilike('username', username.replaceAll('_', '\\_')).limit(2);
      if (error) return res.status(503).json({ error: 'Staff sign-in is unavailable. Please try again.' });
      if (data?.length !== 1 || !data[0].email || !isAccountActive(data[0].status)) return invalid();
      const officer = data[0];
      const signIn = await auth.auth.signInWithPassword({ email: officer.email, password });
      if (signIn.error || !signIn.data.session || !signIn.data.user ||
        (officer.auth_user_id && officer.auth_user_id !== signIn.data.user.id)) return invalid();
      const { access_token, refresh_token } = signIn.data.session;
      return res.status(200).json({ access_token, refresh_token });
    }

    if (body.action !== 'create') return res.status(400).json({ error: 'Unknown staff account action.' });
    const token = typeof req.headers.authorization === 'string' ? /^Bearer (\S+)$/i.exec(req.headers.authorization)?.[1] : undefined;
    if (!token) return res.status(401).json({ error: 'Sign in as Central Admin.' });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user || user.is_anonymous) return res.status(401).json({ error: 'Sign in as Central Admin.' });

    if (!isVerifiedAdminEmail(user)) {
      const { data: admin } = await service.from('admin_accounts').select('active')
        .eq('auth_user_id', user.id).eq('active', true).maybeSingle();
      if (!admin) return res.status(403).json({ error: 'Only Central Admin can create LFT accounts.' });
    }

    const name = text(body.name);
    const email = text(body.email, 255).toLowerCase();
    const status = ['Active / Certified', 'Pending Activation', 'Disabled / Inactive'].includes(body.status)
      ? body.status : 'Active / Certified';
    const assigned: string[] = Array.isArray(body.assignedBarangays) ? [...new Set<string>(body.assignedBarangays)] : [];
    const allowed = new Set<string>(OFFICIAL_15_BARANGAYS);
    if (!name || !validEmail.test(email) || !validUsername.test(username) || reservedUsernames.has(username) ||
        password.length < 8 || password.length > 1024 || !assigned.length || assigned.some((value) => !allowed.has(value))) {
      return res.status(400).json({ error: 'Enter a name, valid email, available username, password of at least 8 characters, and assigned barangays.' });
    }

    const { data: usernames, error: lookupError } = await service.from('lft_technicians')
      .select('id').ilike('username', username.replaceAll('_', '\\_')).limit(1);
    if (lookupError) return res.status(503).json({ error: 'Unable to check username availability.' });
    if (usernames?.length) return res.status(409).json({ error: 'This username is already in use.' });

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (createError || !created.user) {
      if (createError?.code === 'email_exists' || createError?.code === 'user_already_exists') {
        return res.status(409).json({ error: 'An Auth account already exists for this email.' });
      }
      return res.status(400).json({ error: 'Supabase could not create this sign-in. Check the email and password requirements.' });
    }

    const id = crypto.randomUUID();
    const authUserId = created.user.id;
    const { error: rosterError } = await service.from('lft_technicians').insert({
      id, auth_user_id: authUserId, username, name, email,
      barangay: assigned.join(', '), assigned_barangays: assigned,
      contact_number: text(body.contactNumber, 30), terrain: text(body.terrain),
      area_ha: Math.max(0, Number(body.areaHa) || 0), puroks: Math.max(0, Math.trunc(Number(body.puroks) || 0)),
      photo_url: text(body.photoUrl, 2048), status
    });
    if (rosterError) {
      const check = await service.from('lft_technicians').select('id').eq('id', id).maybeSingle();
      if (check.error) return res.status(503).json({ error: 'Supabase could not confirm the roster entry. Check whether the officer was saved before retrying.' });
      if (!check.data) {
        const cleanup = await service.auth.admin.deleteUser(authUserId);
        return res.status(409).json({
          error: cleanup.error ? 'Roster creation failed and the new Auth user could not be removed. Check the Supabase account before retrying.'
            : 'The LFT roster entry could not be saved. The new sign-in was rolled back.'
        });
      }
    }
    return res.status(201).json({ id });
  } catch {
    return res.status(503).json({ error: 'Unable to connect to the staff account service.' });
  }
}
