import { Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../../context/PortalContext.tsx';

export function AdminAuthGate() {
  const { setAdminSession } = usePortal();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [envPasscodeConfigured, setEnvPasscodeConfigured] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [name, setName] = useState('Maheep Editorial Chief');
  const [email, setEmail] = useState('maheepmedia@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    setStatusError('');
    try {
      const res = await fetch('/api/admin/auth/status', {
        headers: { Accept: 'application/json' },
      });
      const text = await res.text();
      let json: { needsSetup?: boolean; envPasscodeConfigured?: boolean; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response from server (HTTP ${res.status}). Ensure the Express backend is running.`);
      }
      if (!res.ok) {
        throw new Error(json.error || `Auth status failed (HTTP ${res.status})`);
      }
      setNeedsSetup(Boolean(json.needsSetup));
      setEnvPasscodeConfigured(Boolean(json.envPasscodeConfigured));
    } catch (err) {
      setNeedsSetup(false);
      setStatusError(
        err instanceof Error
          ? err.message
          : 'Could not reach the authentication server. Please verify the backend is running.',
      );
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = needsSetup ? '/api/admin/auth/claim' : '/api/admin/auth/login';
      const body = needsSetup ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      let json: { token?: string; user?: any; error?: string } = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        setError(
          `Authentication endpoint returned HTTP ${res.status} (non-JSON). If you deployed only the static frontend, ensure the Node backend or Supabase Auth is connected.`,
        );
        return;
      }

      if (!res.ok) {
        setError(json.error || `Authentication failed (HTTP ${res.status}).`);
        return;
      }

      if (!json.token || !json.user) {
        setError('Invalid authentication response from server.');
        return;
      }

      setAdminSession(json.token, json.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Network error reaching authentication server: ${err.message}`
          : 'Unable to connect to authentication server.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-2.5 text-[#00652E] dark:text-[#4ade80] mb-4">
          {needsSetup ? <ShieldCheck className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          <span className="font-editorial text-xl font-bold">MAHEEP NEWS PORTAL</span>
        </div>

        {statusError && (
          <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-2">
            <div>{statusError}</div>
            <button
              type="button"
              onClick={() => void checkStatus()}
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <RefreshCw className="w-3 h-3" /> Retry Connection
            </button>
          </div>
        )}

        {needsSetup === null ? (
          <p className="text-sm text-neutral-500 py-6">Checking editorial access status...</p>
        ) : (
          <>
            <h1 className="text-xl font-bold text-neutral-950 dark:text-white">
              {needsSetup ? 'Claim Primary Admin Account' : 'Editorial Admin Sign In'}
            </h1>
            <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {needsSetup
                ? 'First-run setup: create a secure password for the primary editorial administrator. Public registration is permanently disabled after setup.'
                : envPasscodeConfigured
                ? 'Sign in with your authorized admin email (e.g. maheepmedia@gmail.com) and your configured ADMIN_PASSCODE.'
                : 'Sign in with your authorized Maheep News Portal administrator credentials.'}
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {needsSetup && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Administrator Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  {needsSetup ? 'Create Password (min. 8 characters)' : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  minLength={needsSetup ? 8 : 4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {loading ? 'Verifying...' : needsSetup ? 'Claim Admin Access' : 'Sign In to Dashboard'}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 text-center">
          <Link to="/" className="text-xs font-medium text-[#00652E] dark:text-[#4ade80] hover:underline">
            ← Return to Public Newspaper
          </Link>
        </div>
      </div>
    </div>
  );
}
