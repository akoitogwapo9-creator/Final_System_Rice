import React, { useState, useEffect, useId } from 'react';
import { useApp } from '../context/AppContext';
import { User, isAccountActive } from '../types';
import { OfficialSealsTrio } from './Seals';
import { supabase } from '../supabase';
import { supabaseDb } from '../utils/supabaseClient';
import {
  getLoginLockoutRemainingSec,
  recordLoginFailure,
  resetLoginRateLimit
} from '../utils/security';
import { X, Lock, User as UserIcon, Eye, EyeOff, AlertCircle } from 'lucide-react';

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_USERNAMES = new Set(['admin', 'administrator', 'mao']);

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user?: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { setCurrentUser, lftAccounts } = useApp();
  const titleId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setShowPassword(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingLogin) return;

    const lockoutSec = getLoginLockoutRemainingSec();
    if (lockoutSec > 0) {
      setError(`Too many failed sign-in attempts. Please wait ${lockoutSec} seconds before trying again.`);
      return;
    }

    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Enter your username or email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    const normalizedUsername = cleanUser.toLowerCase();
    const matchedLft = lftAccounts.find((account) => account.username.toLowerCase() === normalizedUsername);
    const testAccountIdentifiers = ['silago.test', 'silago.test@local.invalid'];
    const isTestAccount = testAccountIdentifiers.includes(cleanUser.toLowerCase());

    if (isTestAccount && !import.meta.env.DEV) {
      setError('The Silago test account works only in local development. Start the app with `npm run dev` and try again.');
      return;
    }

    // Development-only account for local UI and workflow review. Vite removes this branch from production builds.
    if (import.meta.env.DEV && isTestAccount && password === 'TestSilago2026!') {
      resetLoginRateLimit();
      const testUser: User = {
        username: 'silago.test',
        role: 'Central Admin',
        name: 'Silago Test Administrator',
        title: 'Testing Account',
        email: 'silago.test@local.invalid',
        contactNumber: '',
        office: 'Silago Municipal Agriculture Office (Test)'
      };
      setCurrentUser(testUser);
      onClose();
      onSuccess?.(testUser);
      return;
    }

    if (isTestAccount) {
      const wait = recordLoginFailure();
      setError(wait > 0 ? `Too many failed attempts. Locked for ${wait}s.` : 'Invalid username or password. Please try again.');
      return;
    }

    setIsSubmittingLogin(true);
    setError('');
    try {
      if (matchedLft && !isAccountActive(matchedLft.status)) {
        setError('Account inactive. Contact the Central Admin.');
        return;
      }

      const email = normalizedUsername.includes('@')
        ? normalizedUsername
        : ADMIN_USERNAMES.has(normalizedUsername) ? ADMIN_EMAIL : matchedLft?.email;
      if (!email?.trim()) {
        setError('Sign in using the email address registered with your account.');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (signInError) {
        if (signInError.code === 'email_not_confirmed') {
          setError('Confirm the account email in Supabase before signing in.');
        } else if (signInError.code === 'invalid_credentials' || signInError.status === 400) {
          const wait = recordLoginFailure();
          setError(wait > 0 ? `Too many failed attempts. Locked for ${wait}s.` : 'Invalid username or password.');
        } else {
          setError('Supabase could not complete sign-in. Please try again.');
        }
        return;
      }
      let staff: User | null;
      try {
        staff = await supabaseDb.getStaffAccount();
      } catch {
        await supabase.auth.signOut({ scope: 'local' });
        setError('Your credentials were accepted, but the staff account could not be verified.');
        return;
      }
      if (!staff) {
        await supabase.auth.signOut({ scope: 'local' });
        setError('This sign-in is confirmed, but no active staff account is linked. Contact the registry administrator.');
        return;
      }
      resetLoginRateLimit();
      // The app resolves the authenticated session and role before opening the workspace.
    } catch {
      setError('Unable to sign in. Check your connection and try again.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-100 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-gov-ink w-full max-w-[480px] rounded-md shadow-2xl overflow-hidden border border-gov-line-strong my-auto animate-in zoom-in-95 duration-200"
      >
        {/* Header with official municipal badges */}
        <div className="bg-gov-forest text-white p-5 sm:p-6 relative border-b-2 border-gov-gold">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <OfficialSealsTrio className="shrink-0 pt-0.5" />
              <div>
                <span className="text-[10px] font-semibold text-amber-200 uppercase tracking-[0.14em] block">
                  RICE FARM REGISTRY &amp; GEOREFERENCING
                </span>
                <h3 id={titleId} className="font-serif font-bold text-lg text-white leading-tight mt-0.5">
                  Official Staff Sign In
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        </div>

        {/* Modal Content Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
          {error && (
            <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor={usernameId} className="gov-label">
                Username or email
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-gov-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id={usernameId}
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="admin"
                  className="gov-input pl-9 pr-3 py-2"
                />
              </div>
            </div>

            <div>
              <label htmlFor={passwordId} className="gov-label">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gov-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  className="gov-input pl-9 pr-9 py-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gov-muted hover:text-gov-ink cursor-pointer p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="gov-btn gov-btn-primary w-full py-2.5 text-xs"
            >
              <span>{isSubmittingLogin ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
