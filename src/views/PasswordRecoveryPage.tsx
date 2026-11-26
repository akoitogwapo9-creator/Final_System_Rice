import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export const PASSWORD_RECOVERY_PATH = '/reset-password';

export const isPasswordRecoveryLocation = typeof window !== 'undefined' && (
  window.location.pathname.replace(/\/$/, '') === PASSWORD_RECOVERY_PATH
  || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
);

// Supabase can finish processing the link before React mounts the recovery page.
let initialRecoveryAccountId: string | undefined;
if (isPasswordRecoveryLocation) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    if (session?.user && !session.user.is_anonymous) initialRecoveryAccountId = session.user.id;
    subscription.unsubscribe();
  });
}

export function PasswordRecoveryPage() {
  const [status, setStatus] = useState<'checking' | 'invalid' | 'ready' | 'saved'>('checking');
  const [accountId, setAccountId] = useState<string>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user && !session.user.is_anonymous) {
        setAccountId(session.user.id);
        setStatus('ready');
      } else if (event === 'INITIAL_SESSION') {
        if (initialRecoveryAccountId && session?.user.id === initialRecoveryAccountId) {
          setAccountId(initialRecoveryAccountId);
          setStatus('ready');
        } else {
          setStatus((previous) => previous === 'checking' ? 'invalid' : previous);
        }
      } else if (event === 'SIGNED_OUT') {
        initialRecoveryAccountId = undefined;
        setStatus((previous) => previous === 'saved' ? 'saved' : 'invalid');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== 'ready' || !accountId || isSaving) return;
    if (password !== confirmation) {
      setMessage('Passwords do not match.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    try {
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || user?.id !== accountId) {
        setStatus('invalid');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }
      setPassword('');
      setConfirmation('');
      setStatus('saved');
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      setMessage('Unable to complete the password reset. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Reset your registry password</h1>
        {status === 'checking' && <p role="status" className="text-sm text-slate-600">Verifying your recovery link…</p>}
        {status === 'invalid' && <p className="text-sm text-slate-600">This link is invalid or expired. Return to sign in and request a new email.</p>}
        {status === 'saved' && <p role="status" className="text-sm text-slate-600">Your password was updated. Sign in with your new password.</p>}
        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">
              <span>New password</span>
              <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
            <button type="submit" disabled={isSaving} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {isSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        <a href="/" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Back to the registry</a>
      </section>
    </main>
  );
}
