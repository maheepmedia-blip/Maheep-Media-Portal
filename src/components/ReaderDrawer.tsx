import {
  Bell,
  BellOff,
  Bookmark,
  BookOpen,
  Clock,
  ExternalLink,
  Flame,
  Heart,
  LogOut,
  Trash2,
  User,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type FontSizeScale, type LanguageFilter, usePortal } from '../context/PortalContext.tsx';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  signInReaderWithGoogle,
  signInReaderWithGoogleRedirect,
  syncFirebaseWithGoogleCredential,
} from '../firebase.ts';
import type { Article, ReaderEpaperBookmark, ReaderFollow } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';

interface GisWindow {
  google?: {
    accounts?: {
      id?: {
        initialize: (cfg: {
          client_id: string;
          callback: (resp: { credential?: string }) => void;
          use_fedcm_for_prompt?: boolean;
        }) => void;
        renderButton: (
          el: HTMLElement,
          opts: { theme?: string; size?: string; width?: number; text?: string; shape?: string },
        ) => void;
      };
    };
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface WeeklyReport {
  streakDays: number;
  lastEpaperEdition: string;
  lastEpaperPage: number;
  articlesReadLast7Days: number;
  totalBookmarks: number;
  topCategories: Array<{ category: string; count: number }>;
}

export function ReaderDrawer() {
  const {
    readerDrawerOpen,
    setReaderDrawerOpen,
    readerToken,
    readerUser,
    setReaderSession,
    logoutReader,
    language,
    setLanguage,
    fontSize,
    setFontSize,
  } = usePortal();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'bookmarks' | 'history' | 'follows' | 'prefs'>('bookmarks');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [popupHelpNeeded, setPopupHelpNeeded] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const gisButtonRef = useRef<HTMLDivElement | null>(null);

  const [bookmarks, setBookmarks] = useState<Article[]>([]);
  const [epaperBookmarks, setEpaperBookmarks] = useState<ReaderEpaperBookmark[]>([]);
  const [history, setHistory] = useState<Array<Article & { read_at?: string }>>([]);
  const [follows, setFollows] = useState<ReaderFollow[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [profileName, setProfileName] = useState(readerUser?.name || '');

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const newTabSignInUrl =
    typeof window !== 'undefined'
      ? (() => {
          const u = new URL(window.location.href);
          u.searchParams.set('readerAuth', '1');
          return u.toString();
        })()
      : '/?readerAuth=1';

  useEffect(() => {
    if (readerUser?.name) setProfileName(readerUser.name);
  }, [readerUser?.name]);

  const loadReaderData = useCallback(async () => {
    if (!readerToken) return;
    const headers = { Authorization: `Bearer ${readerToken}` };
    try {
      const [bRes, hRes, fRes, epRes, wRes] = await Promise.all([
        fetch('/api/reader/bookmarks', { headers }),
        fetch('/api/reader/history', { headers }),
        fetch('/api/reader/follows', { headers }),
        fetch('/api/reader/epaper-bookmarks', { headers }),
        fetch('/api/reader/weekly-report', { headers }),
      ]);
      if (bRes.ok) setBookmarks((await bRes.json()).bookmarks || []);
      if (hRes.ok) setHistory((await hRes.json()).history || []);
      if (fRes.ok) setFollows((await fRes.json()).follows || []);
      if (epRes.ok) setEpaperBookmarks((await epRes.json()).bookmarks || []);
      if (wRes.ok) setWeeklyReport(await wRes.json());
    } catch {
      // Ignore transient error
    }
  }, [readerToken]);

  useEffect(() => {
    if (readerDrawerOpen && readerToken) {
      loadReaderData();
    }
  }, [readerDrawerOpen, readerToken, loadReaderData]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker
        .getRegistration('/sw.js')
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(Boolean(sub)))
        .catch(() => {});
    }
  }, [readerDrawerOpen]);

  const exchangeGoogleIdToken = useCallback(
    async (idToken: string, syncFirebase = false) => {
      if (syncFirebase) {
        void syncFirebaseWithGoogleCredential(idToken).catch(() => {});
      }
      const res = await fetch('/api/reader/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Google sign-up failed');
      setReaderSession(json.token, json.user);
      setPopupHelpNeeded(false);
      setNotice(
        json.isNewAccount
          ? `Welcome to Maheep News Portal, ${json.user.name}. Your Google reader account is ready.`
          : `Signed in with Google as ${json.user.name}.`,
      );
    },
    [setReaderSession],
  );

  useEffect(() => {
    if (!readerDrawerOpen || readerUser || !GOOGLE_OAUTH_CLIENT_ID || typeof window === 'undefined') return;
    let active = true;

    const initGis = () => {
      const gisId = (window as unknown as GisWindow).google?.accounts?.id;
      const target = gisButtonRef.current;
      if (!active || !gisId || !target) return;
      try {
        gisId.initialize({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          use_fedcm_for_prompt: true,
          callback: (resp) => {
            if (!resp.credential) return;
            setGoogleLoading(true);
            setError('');
            setNotice('');
            void exchangeGoogleIdToken(resp.credential, true)
              .catch((err) => {
                setError(err instanceof Error ? err.message : 'Unable to complete Google sign-in.');
              })
              .finally(() => setGoogleLoading(false));
          },
        });
        target.innerHTML = '';
        gisId.renderButton(target, {
          theme: 'outline',
          size: 'large',
          width: Math.min(360, target.clientWidth || 340),
          text: 'continue_with',
          shape: 'rectangular',
        });
        setGisReady(true);
      } catch {
        setGisReady(false);
      }
    };

    const existingGis = (window as unknown as GisWindow).google?.accounts?.id;
    if (existingGis) {
      initGis();
      return () => {
        active = false;
      };
    }

    const scriptId = 'google-gsi-client-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const onLoad = () => initGis();
    script.addEventListener('load', onLoad);
    return () => {
      active = false;
      script?.removeEventListener('load', onLoad);
    };
  }, [readerDrawerOpen, readerUser, exchangeGoogleIdToken]);

  if (!readerDrawerOpen) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'login' ? '/api/reader/login' : '/api/reader/register';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Authentication failed');
      setReaderSession(json.token, json.user);
      setPassword('');
      setNotice(`Signed in as ${json.user.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError('');
    setNotice('');
    setPopupHelpNeeded(false);
    try {
      const cred = await signInReaderWithGoogle();
      const idToken = await cred.user.getIdToken();
      await exchangeGoogleIdToken(idToken, false);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Google sign-in popup was closed before completing.');
      } else if (code === 'auth/popup-blocked') {
        setPopupHelpNeeded(true);
        setError('Your browser blocked the Google popup inside this preview frame.');
      } else if (code === 'auth/unauthorized-domain') {
        setPopupHelpNeeded(true);
        setError(
          `Domain "${window.location.hostname}" needs authorization in Firebase Auth settings, or open in a new tab to use Google Sign-In.`,
        );
      } else if (code === 'auth/operation-not-allowed') {
        setPopupHelpNeeded(true);
        setError('Google Sign-In provider is not yet enabled in Firebase Auth.');
      } else {
        setPopupHelpNeeded(true);
        setError(err instanceof Error ? err.message : 'Unable to open Google sign-up popup.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleRedirectFallback = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await signInReaderWithGoogleRedirect();
    } catch (err) {
      setGoogleLoading(false);
      setError(err instanceof Error ? err.message : 'Unable to start Google redirect sign-in.');
    }
  };

  const removeBookmark = async (articleId: string) => {
    if (!readerToken) return;
    const res = await fetch(`/api/reader/bookmarks/${articleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    if (res.ok) setBookmarks((prev) => prev.filter((b) => b.id !== articleId));
  };

  const removeEpaperBookmark = async (id: string) => {
    if (!readerToken) return;
    const res = await fetch(`/api/reader/epaper-bookmarks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    if (res.ok) setEpaperBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const removeFollow = async (follow: ReaderFollow) => {
    if (!readerToken) return;
    const res = await fetch(`/api/reader/follows/${follow.follow_type}/${encodeURIComponent(follow.target_slug)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    if (res.ok) setFollows((prev) => prev.filter((f) => f.id !== follow.id));
  };

  const savePreferences = async (nextLang: LanguageFilter, nextFont: FontSizeScale) => {
    setLanguage(nextLang);
    setFontSize(nextFont);
    if (!readerToken || !readerUser) return;
    const res = await fetch('/api/reader/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerToken}`,
      },
      body: JSON.stringify({ preferred_language: nextLang, font_size: nextFont }),
    });
    if (res.ok) {
      const json = await res.json();
      setReaderSession(readerToken, json.user);
      setNotice('Reader preferences saved.');
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!readerToken || profileName.trim().length < 2) return;
    const res = await fetch('/api/reader/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerToken}`,
      },
      body: JSON.stringify({ name: profileName.trim(), preferred_language: language, font_size: fontSize }),
    });
    if (res.ok) {
      const json = await res.json();
      setReaderSession(readerToken, json.user);
      setNotice('Profile updated.');
    }
  };

  const togglePushAlerts = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('Web Push notifications are not supported by this browser.');
      return;
    }
    setPushBusy(true);
    setError('');
    setNotice('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushSubscribed(false);
        setNotice('Breaking news push notifications disabled.');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          throw new Error('Notification permission was declined by your browser.');
        }
        const keyRes = await fetch('/api/push/vapid-key');
        const keyJson = await keyRes.json();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), language }),
        });
        setPushSubscribed(true);
        setNotice('Subscribed to breaking news push alerts.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push setup failed.');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex justify-end no-print" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 h-full overflow-y-auto shadow-2xl border-l border-neutral-200 dark:border-neutral-800 flex flex-col">
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-[#EAF5E5]/70 dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
            <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">Reader Desk</h2>
          </div>
          <button
            type="button"
            onClick={() => setReaderDrawerOpen(false)}
            className="p-1.5 rounded hover:bg-white dark:hover:bg-neutral-800"
            aria-label="Close Reader Desk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {notice && (
            <div className="p-2.5 rounded bg-[#EAF5E5] dark:bg-[#00451F]/50 text-xs text-[#00451F] dark:text-[#4ade80] font-medium">
              {notice}
            </div>
          )}
          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 text-xs text-[#DF2525] font-medium">
              {error}
            </div>
          )}

          {/* Browser Push & Reading Accessibility */}
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-3 bg-neutral-50 dark:bg-neutral-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-neutral-900 dark:text-white">Breaking News Alerts</div>
                <p className="text-[11px] text-neutral-500">Receive major India updates directly via browser push.</p>
              </div>
              <button
                type="button"
                disabled={pushBusy}
                onClick={togglePushAlerts}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ${
                  pushSubscribed
                    ? 'bg-[#00652E] text-white'
                    : 'border border-[#00652E] text-[#00652E] dark:text-[#4ade80]'
                }`}
              >
                {pushSubscribed ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {pushBusy ? '...' : pushSubscribed ? 'Enabled' : 'Notify Me'}
              </button>
            </div>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Article Text Size</span>
              <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
                {(['sm', 'md', 'lg'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => savePreferences(language, sz)}
                    className={`px-2.5 py-1 font-semibold ${
                      fontSize === sz
                        ? 'bg-[#00652E] text-white'
                        : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {sz === 'sm' ? 'A-' : sz === 'md' ? 'A' : 'A+'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!readerUser ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Optional Reader Account</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Sign up with Google or email to save articles, E-Paper pages, follows, reading streaks, and digest preferences.
                </p>
              </div>

              <div className="space-y-2.5">
                {GOOGLE_OAUTH_CLIENT_ID && (
                  <div
                    ref={gisButtonRef}
                    className={gisReady ? 'w-full flex justify-center min-h-[40px]' : 'hidden'}
                  />
                )}

                <button
                  type="button"
                  onClick={() => void handleGoogleAuth()}
                  disabled={googleLoading || loading}
                  className="w-full py-2.5 px-3 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-semibold inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.05 1.15-3.12 0-5.76-2.11-6.7-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.3 14.29A7.2 7.2 0 0 1 4.92 12c0-.79.14-1.56.38-2.29V6.61H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l4.01-3.1Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4.01 3.1C6.24 6.87 8.88 4.76 12 4.76Z"
                    />
                  </svg>
                  <span>
                    {googleLoading
                      ? 'Connecting to Google...'
                      : gisReady
                        ? 'Continue with Google (Firebase Popup)'
                        : 'Continue with Google'}
                  </span>
                </button>

                {(isInIframe || popupHelpNeeded) && (
                  <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1.5">
                    {isInIframe && (
                      <div className="flex items-center justify-between gap-2">
                        <span>Popup blocked inside preview?</span>
                        <a
                          href={newTabSignInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline shrink-0"
                        >
                          Open in New Tab <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {!isInIframe && popupHelpNeeded && (
                      <button
                        type="button"
                        onClick={() => void handleGoogleRedirectFallback()}
                        className="w-full py-1.5 px-2.5 rounded border border-[#00652E] text-[#00652E] dark:text-[#4ade80] font-semibold hover:bg-[#EAF5E5] dark:hover:bg-[#00451F]/30 transition-colors"
                      >
                        Use Full-Page Google Redirect Instead
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
                <span className="px-2.5 text-[11px] uppercase tracking-wider text-neutral-400 font-medium">
                  or with email
                </span>
                <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
              </div>

              <div className="flex rounded border border-neutral-200 dark:border-neutral-800 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex-1 py-1.5 rounded ${mode === 'login' ? 'bg-[#00652E] text-white' : ''}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className={`flex-1 py-1.5 rounded ${mode === 'register' ? 'bg-[#00652E] text-white' : ''}`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuth} className="space-y-3">
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="reader@example.com"
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold"
                >
                  {loading ? 'Working...' : mode === 'login' ? 'Sign In as Reader' : 'Register Reader Account'}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#EAF5E5]/60 dark:bg-neutral-800">
                <div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span>{readerUser.name}</span>
                    {Boolean(weeklyReport?.streakDays || readerUser.streak_days) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[#00652E] dark:text-[#4ade80]">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        {weeklyReport?.streakDays ?? readerUser.streak_days}d streak
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">{readerUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={logoutReader}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#DF2525] hover:underline"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>

              {/* Weekly Reading Report & Resume E-Paper */}
              {weeklyReport && (
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-2 text-xs">
                  <div className="font-bold text-neutral-800 dark:text-neutral-200">
                    Your Weekly Reading Summary
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono-tabular text-center">
                    <div className="p-2 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                      <div className="text-base font-bold text-[#00652E] dark:text-[#4ade80]">
                        {weeklyReport.articlesReadLast7Days}
                      </div>
                      <div className="text-[10px] text-neutral-500">7d Reads</div>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                      <div className="text-base font-bold text-[#00652E] dark:text-[#4ade80]">
                        {weeklyReport.streakDays}
                      </div>
                      <div className="text-[10px] text-neutral-500">Day Streak</div>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                      <div className="text-base font-bold text-[#00652E] dark:text-[#4ade80]">
                        {weeklyReport.totalBookmarks}
                      </div>
                      <div className="text-[10px] text-neutral-500">Saved</div>
                    </div>
                  </div>
                  {weeklyReport.lastEpaperEdition && (
                    <Link
                      to={`/epaper?date=${weeklyReport.lastEpaperEdition}&page=${weeklyReport.lastEpaperPage}`}
                      onClick={() => setReaderDrawerOpen(false)}
                      className="flex items-center justify-between pt-1 text-[#00652E] dark:text-[#4ade80] font-semibold hover:underline"
                    >
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        Resume E-Paper ({weeklyReport.lastEpaperEdition} · P.{weeklyReport.lastEpaperPage})
                      </span>
                      <span>→</span>
                    </Link>
                  )}
                </div>
              )}

              <div className="flex border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold gap-3 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setTab('bookmarks')}
                  className={`pb-2 border-b-2 inline-flex items-center gap-1 whitespace-nowrap ${
                    tab === 'bookmarks' ? 'border-[#00652E] text-[#00652E]' : 'border-transparent text-neutral-500'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" /> Saved ({bookmarks.length + epaperBookmarks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('history')}
                  className={`pb-2 border-b-2 inline-flex items-center gap-1 whitespace-nowrap ${
                    tab === 'history' ? 'border-[#00652E] text-[#00652E]' : 'border-transparent text-neutral-500'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> History ({history.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('follows')}
                  className={`pb-2 border-b-2 inline-flex items-center gap-1 whitespace-nowrap ${
                    tab === 'follows' ? 'border-[#00652E] text-[#00652E]' : 'border-transparent text-neutral-500'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" /> Follows ({follows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('prefs')}
                  className={`pb-2 border-b-2 whitespace-nowrap ${
                    tab === 'prefs' ? 'border-[#00652E] text-[#00652E]' : 'border-transparent text-neutral-500'
                  }`}
                >
                  Profile
                </button>
              </div>

              {tab === 'bookmarks' && (
                <div className="space-y-3">
                  {epaperBookmarks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-neutral-500">Saved E-Paper Pages</div>
                      {epaperBookmarks.map((eb) => (
                        <div
                          key={eb.id}
                          className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 text-xs"
                        >
                          <Link
                            to={`/epaper?date=${eb.edition_date}&page=${eb.page_number}`}
                            onClick={() => setReaderDrawerOpen(false)}
                            className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                          >
                            {eb.edition_date} · Page {eb.page_number} ({eb.section_title})
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeEpaperBookmark(eb.id)}
                            className="p-1 text-neutral-400 hover:text-[#DF2525]"
                            aria-label="Remove E-Paper page bookmark"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {bookmarks.length === 0 && epaperBookmarks.length === 0 ? (
                    <p className="text-xs text-neutral-500">No saved stories yet. Click Save on any article or E-Paper page.</p>
                  ) : (
                    bookmarks.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 rounded border border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-2"
                      >
                        <div>
                          <Link
                            to={`/news/${b.slug}`}
                            onClick={() => setReaderDrawerOpen(false)}
                            className="text-xs font-bold hover:text-[#00652E] line-clamp-2"
                          >
                            {b.title}
                          </Link>
                          <div className="text-[11px] text-neutral-500 mt-1">
                            {b.category_name} · {formatIndiaDate(b.published_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBookmark(b.id)}
                          className="p-1 text-neutral-400 hover:text-[#DF2525]"
                          aria-label="Remove bookmark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'history' && (
                <div className="space-y-2.5">
                  {history.length === 0 ? (
                    <p className="text-xs text-neutral-500">Articles you read while signed in will appear here.</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="p-3 rounded border border-neutral-200 dark:border-neutral-800">
                        <Link
                          to={`/news/${h.slug}`}
                          onClick={() => setReaderDrawerOpen(false)}
                          className="text-xs font-bold hover:text-[#00652E] line-clamp-2"
                        >
                          {h.title}
                        </Link>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          {h.category_name} · Read {formatIndiaDate(h.read_at || h.published_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'follows' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Topics, States &amp; Authors you follow</span>
                    <Link
                      to="/briefing"
                      onClick={() => setReaderDrawerOpen(false)}
                      className="font-semibold text-[#00652E] hover:underline"
                    >
                      Open My News →
                    </Link>
                  </div>
                  {follows.length === 0 ? (
                    <p className="text-neutral-500">
                      Click Follow on any article, topic, or state in the India News Map to customize your feed.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {follows.map((fl) => (
                        <div
                          key={fl.id}
                          className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold">{fl.target_label}</span>
                            <span className="ml-2 text-[11px] text-neutral-500 capitalize">({fl.follow_type})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeFollow(fl)}
                            className="text-[#DF2525] font-semibold hover:underline"
                          >
                            Unfollow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'prefs' && (
                <div className="space-y-4 text-xs">
                  <form onSubmit={saveProfile} className="p-3 rounded border border-neutral-200 dark:border-neutral-800 space-y-2">
                    <label className="block font-semibold">Reader Display Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                      />
                      <button type="submit" className="px-3 py-1.5 rounded bg-[#00652E] text-white font-semibold">
                        Save
                      </button>
                    </div>
                  </form>
                  <p className="text-neutral-500">Choose your default edition language:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['all', 'en', 'hi'] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => savePreferences(l, fontSize)}
                        className={`py-2 rounded border font-semibold ${
                          language === l
                            ? 'bg-[#00652E] text-white border-[#00652E]'
                            : 'border-neutral-300 dark:border-neutral-700'
                        }`}
                      >
                        {l === 'all' ? 'All' : l === 'en' ? 'English' : 'हिन्दी'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
