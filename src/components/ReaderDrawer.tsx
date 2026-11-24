import {
  Bell,
  BellOff,
  Bookmark,
  BookOpen,
  Clock,
  Flame,
  Heart,
  LogOut,
  Trash2,
  User,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type FontSizeScale, type LanguageFilter, usePortal } from '../context/PortalContext.tsx';
import type { Article, ReaderEpaperBookmark, ReaderFollow } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';

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

  const [bookmarks, setBookmarks] = useState<Article[]>([]);
  const [epaperBookmarks, setEpaperBookmarks] = useState<ReaderEpaperBookmark[]>([]);
  const [history, setHistory] = useState<Array<Article & { read_at?: string }>>([]);
  const [follows, setFollows] = useState<ReaderFollow[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [profileName, setProfileName] = useState(readerUser?.name || '');

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
                  Sign in optionally to save articles, E-Paper pages, follows, reading streaks, and weekly digest preferences.
                </p>
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
