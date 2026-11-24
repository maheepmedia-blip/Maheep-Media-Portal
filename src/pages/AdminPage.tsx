import {
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Mail,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Settings,
  Sliders,
  Trash2,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminArticleModal } from '../components/admin/AdminArticleModal.tsx';
import { AdminAuthGate } from '../components/admin/AdminAuthGate.tsx';
import { AdminMigrationPanel } from '../components/admin/AdminMigrationPanel.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type {
  AdminUser,
  Article,
  Category,
  ContactSubmission,
  Edition,
  RssLog,
  RssSource,
  StateItem,
} from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';
import { downloadEditionPdf } from '../utils/pdf.ts';

type AdminTab =
  | 'overview'
  | 'articles'
  | 'rss'
  | 'publishing'
  | 'editions'
  | 'migration'
  | 'taxonomy'
  | 'contacts'
  | 'settings';

export function AdminPage() {
  const { adminToken, adminUser, logoutAdmin } = usePortal();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Data states
  const [overview, setOverview] = useState<{
    stats: {
      totalArticles: number;
      publishedArticles: number;
      draftArticles: number;
      pendingArticles: number;
      todaysArticles: number;
    };
    editions: number;
    contactsNew: number;
    subscribers: number;
    rssSources: RssSource[];
    recentLogs: RssLog[];
    scheduling: {
      lastRunAt: string;
      nextRunAt: string;
      intervalMinutes: number;
      publishingMode: string;
    };
  } | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);
  const [rssSources, setRssSources] = useState<RssSource[]>([]);
  const [rssLogs, setRssLogs] = useState<RssLog[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [subscribers, setSubscribers] = useState<Array<{ id: string; email: string; status: string; created_at: string }>>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  // Filter & Selection state
  const [artSearch, setArtSearch] = useState('');
  const [artStatus, setArtStatus] = useState('all');
  const [artLang, setArtLang] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingArticle, setEditingArticle] = useState<Partial<Article> | null | undefined>(undefined);

  // Form states
  const [newRssName, setNewRssName] = useState('');
  const [newRssUrl, setNewRssUrl] = useState('');
  const [newRssLang, setNewRssLang] = useState<'en' | 'hi'>('en');
  const [newRssCat, setNewRssCat] = useState('cat-national');
  const [rssRunning, setRssRunning] = useState(false);

  const [editionDateInput, setEditionDateInput] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
  );
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'editor' | 'admin' | 'super_admin'>('editor');
  const [newAdminPass, setNewAdminPass] = useState('');

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          ...(options.headers || {}),
        },
      });
      if (res.status === 401) {
        logoutAdmin();
        throw new Error('Session expired.');
      }
      return res;
    },
    [adminToken, logoutAdmin],
  );

  const loadAll = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [ov, art, cat, st, rss, ed, cnt, sub, setRes] = await Promise.all([
        authFetch('/api/admin/overview').then((r) => r.json()),
        authFetch(
          `/api/admin/articles?status=${artStatus}&language=${artLang}&q=${encodeURIComponent(artSearch)}`,
        ).then((r) => r.json()),
        fetch('/api/categories').then((r) => r.json()),
        fetch('/api/states').then((r) => r.json()),
        authFetch('/api/admin/rss').then((r) => r.json()),
        authFetch('/api/admin/editions').then((r) => r.json()),
        authFetch('/api/admin/contacts').then((r) => r.json()),
        authFetch('/api/admin/subscribers').then((r) => r.json()),
        authFetch('/api/admin/settings').then((r) => r.json()),
      ]);

      setOverview(ov);
      setArticles(art.articles || []);
      setCategories(cat.categories || []);
      setStates(st.states || []);
      setRssSources(rss.sources || []);
      setRssLogs(rss.logs || []);
      setEditions(ed.editions || []);
      setContacts(cnt.contacts || []);
      setSubscribers(sub.subscribers || []);
      setSettings(setRes.settings || {});

      if (adminUser?.role === 'super_admin' || adminUser?.role === 'admin') {
        const usrRes = await authFetch('/api/admin/users');
        if (usrRes.ok) {
          const usrJson = await usrRes.json();
          setAdminUsers(usrJson.users || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    }
  }, [adminToken, adminUser?.role, artLang, artSearch, artStatus, authFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!adminToken || !adminUser) {
    return <AdminAuthGate />;
  }

  const flash = (msg: string) => {
    setError('');
    setNotice(msg);
    setTimeout(() => setNotice(''), 5000);
  };

  const toggleArticleFlag = async (art: Article, patch: Record<string, unknown>) => {
    const res = await authFetch(`/api/admin/articles/${art.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      flash('Article updated.');
      loadAll();
    }
  };

  const deleteArticle = async (id: string) => {
    const res = await authFetch(`/api/admin/articles/${id}`, { method: 'DELETE' });
    if (res.ok) {
      flash('Article deleted.');
      loadAll();
    }
  };

  const runBulkAction = async (action: 'publish' | 'unpublish' | 'delete') => {
    if (selectedIds.length === 0) return;
    const res = await authFetch('/api/admin/articles/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds, action }),
    });
    if (res.ok) {
      setSelectedIds([]);
      flash(`Bulk ${action} applied.`);
      loadAll();
    }
  };

  const runAllRss = async () => {
    setRssRunning(true);
    setError('');
    try {
      const res = await authFetch('/api/admin/rss/run', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'RSS run failed');
      const totalImp = (json.results || []).reduce((acc: number, r: { imported: number }) => acc + r.imported, 0);
      flash(`RSS collection complete. Imported ${totalImp} new dispatches.`);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RSS run failed');
    } finally {
      setRssRunning(false);
    }
  };

  const testRssSource = async (id: string) => {
    setError('');
    const res = await authFetch(`/api/admin/rss/${id}/test`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      setError(`Feed test failed: ${json.error}`);
    } else {
      flash(`Feed reachable! Parsed ${json.count} items (sample: "${json.sample?.[0]?.title || ''}").`);
    }
  };

  const retrySingleRss = async (id: string) => {
    setRssRunning(true);
    try {
      const res = await authFetch(`/api/admin/rss/${id}/run`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Retry failed');
      flash(`Source "${json.result?.name}": ${json.result?.imported} imported, ${json.result?.skipped} skipped.`);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRssRunning(false);
    }
  };

  const addRssSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/admin/rss', {
      method: 'POST',
      body: JSON.stringify({
        name: newRssName,
        feed_url: newRssUrl,
        language: newRssLang,
        category_id: newRssCat,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Could not add RSS feed');
      return;
    }
    setNewRssName('');
    setNewRssUrl('');
    flash('RSS source added.');
    loadAll();
  };

  const generateEdition = async (dateStr?: string) => {
    const res = await authFetch('/api/admin/editions/generate', {
      method: 'POST',
      body: JSON.stringify({ edition_date: dateStr || editionDateInput }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Edition generation failed');
      return;
    }
    flash(`Generated E-Paper edition for ${json.edition.edition_date}.`);
    loadAll();
  };

  const deleteEdition = async (ed: Edition) => {
    if (!window.confirm(`Delete E-Paper edition for ${ed.edition_date}?`)) return;
    const res = await authFetch(`/api/admin/editions/${ed.id}`, { method: 'DELETE' });
    if (res.ok) {
      flash(`Deleted edition ${ed.edition_date}.`);
      loadAll();
    }
  };

  const saveSettings = async (patch: Record<string, string>) => {
    const merged = { ...settings, ...patch };
    setSettings(merged);
    const res = await authFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      flash('Portal settings saved.');
      loadAll();
    }
  };

  const exportSubscribersCsv = () => {
    const csv = ['email,status,created_at', ...subscribers.map((s) => `${s.email},${s.status},${s.created_at}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'maheep-newsletter-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'articles', label: 'Articles', icon: Newspaper },
    { id: 'rss', label: 'RSS Engine', icon: Rss },
    { id: 'publishing', label: 'Publishing & AI', icon: Sliders },
    { id: 'editions', label: 'E-Paper Editions', icon: BookOpen },
    { id: 'migration', label: 'Sheets Migration', icon: FileSpreadsheet },
    { id: 'taxonomy', label: 'Categories & States', icon: FolderTree },
    { id: 'contacts', label: 'Contacts & Readers', icon: Mail },
    { id: 'settings', label: 'Settings & Admins', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col lg:flex-row">
      <SeoHead
        title="Admin Dashboard — Maheep News Portal"
        description="Editorial management console for Maheep News Portal."
      />

      {/* Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-[#00451F] text-white flex flex-col justify-between">
        <div>
          <div className="p-5 border-b border-white/15">
            <div className="font-editorial text-lg font-bold tracking-tight">MAHEEP ADMIN</div>
            <div className="text-xs text-[#EAF5E5]/80 mt-0.5 truncate">{adminUser.email}</div>
            <div className="text-[11px] text-[#4ade80] font-mono-tabular mt-0.5 uppercase">{adminUser.role}</div>
          </div>
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-[#159B42] text-white font-semibold' : 'text-neutral-200 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/15 flex lg:flex-col gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-xs font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Public Newspaper
          </Link>
          <button
            type="button"
            onClick={logoutAdmin}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-red-900/50 hover:bg-red-800/70 text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-neutral-500">Maheep Editorial Console / {navItems.find((n) => n.id === activeTab)?.label}</div>
            <h1 className="text-xl font-bold text-neutral-950 dark:text-white">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingArticle({})}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> New Article
            </button>
            <button
              type="button"
              onClick={runAllRss}
              disabled={rssRunning}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rssRunning ? 'animate-spin' : ''}`} />
              {rssRunning ? 'Collecting...' : 'Collect RSS'}
            </button>
          </div>
        </header>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {notice && (
            <div className="p-3.5 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/50 border border-[#00652E]/30 text-xs font-medium text-[#00451F] dark:text-[#EAF5E5] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="p-3.5 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ['Total Articles', overview.stats.totalArticles],
                  ['Published', overview.stats.publishedArticles],
                  ['Pending Review', overview.stats.pendingArticles],
                  ['Drafts', overview.stats.draftArticles],
                  ["Today's News", overview.stats.todaysArticles],
                  ['E-Paper Editions', overview.editions],
                  ['Unread Contacts', overview.contactsNew],
                  ['Newsletter Readers', overview.subscribers],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4"
                  >
                    <div className="text-xs text-neutral-500">{label}</div>
                    <div className="text-2xl font-bold font-mono-tabular mt-1 text-neutral-950 dark:text-white">
                      {val ?? 0}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                  <h2 className="text-sm font-bold mb-3">RSS Feed Health &amp; Schedule</h2>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1 mb-4 font-mono-tabular">
                    <div>Mode: {overview.scheduling.publishingMode}</div>
                    <div>Interval: Every {overview.scheduling.intervalMinutes} minutes</div>
                    <div>Last Import: {overview.scheduling.lastRunAt ? formatIndiaDateTime(overview.scheduling.lastRunAt) : 'Not run yet in this session'}</div>
                    <div>Next Scheduled: {overview.scheduling.nextRunAt ? formatIndiaDateTime(overview.scheduling.nextRunAt) : 'Pending'}</div>
                  </div>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                    {overview.rssSources.map((src) => (
                      <div key={src.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{src.name}</div>
                          <div className="text-neutral-500">
                            {src.last_error ? `Error: ${src.last_error}` : `Imported total: ${src.imported_count}`}
                          </div>
                        </div>
                        <span className={`font-semibold ${src.last_error ? 'text-[#DF2525]' : 'text-[#00652E] dark:text-[#4ade80]'}`}>
                          {src.enabled ? (src.last_error ? 'Error' : 'Enabled') : 'Disabled'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                  <h2 className="text-sm font-bold mb-3">Recent RSS Import Activity</h2>
                  {overview.recentLogs.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4">No RSS imports logged yet. Click "Collect RSS" to run your first collection.</p>
                  ) : (
                    <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                      {overview.recentLogs.map((log) => (
                        <div key={log.id} className="py-2.5 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{log.source_name}</div>
                            <div className="text-neutral-500">{log.message}</div>
                          </div>
                          <div className="text-right font-mono-tabular shrink-0">
                            <div>+{log.imported} / {log.skipped} skip</div>
                            <div className="text-neutral-400">{formatIndiaDateTime(log.ran_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: ARTICLES */}
          {activeTab === 'articles' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={artSearch}
                    onChange={(e) => setArtSearch(e.target.value)}
                    placeholder="Search headline or source..."
                    className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 w-56"
                  />
                  <select
                    value={artStatus}
                    onChange={(e) => setArtStatus(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  >
                    <option value="all">All Statuses</option>
                    <option value="published">Published</option>
                    <option value="pending">Pending Review</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select
                    value={artLang}
                    onChange={(e) => setArtLang(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  >
                    <option value="all">Hindi &amp; English</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>

                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono-tabular text-neutral-500">{selectedIds.length} selected</span>
                    <button
                      type="button"
                      onClick={() => runBulkAction('publish')}
                      className="px-3 py-1.5 rounded bg-[#00652E] text-white text-xs font-semibold"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={() => runBulkAction('unpublish')}
                      className="px-3 py-1.5 rounded border border-neutral-300 text-xs font-semibold"
                    >
                      Move to Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => runBulkAction('delete')}
                      className="px-3 py-1.5 rounded bg-[#DF2525] text-white text-xs font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                    <tr>
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={articles.length > 0 && selectedIds.length === articles.length}
                          onChange={(e) => setSelectedIds(e.target.checked ? articles.map((a) => a.id) : [])}
                        />
                      </th>
                      <th className="p-3">Headline</th>
                      <th className="p-3">Category / State</th>
                      <th className="p-3">Lang</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Flags</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {articles.map((art) => (
                      <tr key={art.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(art.id)}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, art.id] : prev.filter((id) => id !== art.id),
                              )
                            }
                          />
                        </td>
                        <td className="p-3 max-w-sm">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">{art.title}</div>
                          <div className="text-neutral-500 mt-0.5">{art.source_name} · {formatIndiaDateTime(art.published_at || art.created_at)}</div>
                        </td>
                        <td className="p-3">
                          <div>{art.category_name || '—'}</div>
                          {art.state_name && <div className="text-neutral-500">{art.state_name}</div>}
                        </td>
                        <td className="p-3 font-mono-tabular uppercase">{art.language}</td>
                        <td className="p-3 font-semibold">
                          <span
                            className={
                              art.status === 'published'
                                ? 'text-[#00652E] dark:text-[#4ade80]'
                                : art.status === 'pending'
                                ? 'text-amber-600'
                                : 'text-neutral-500'
                            }
                          >
                            {art.status}
                          </span>
                        </td>
                        <td className="p-3 space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleArticleFlag(art, { featured: !art.featured })}
                            className={`underline ${art.featured ? 'text-[#00652E] font-bold' : 'text-neutral-400'}`}
                          >
                            Featured
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleArticleFlag(art, { breaking: !art.breaking })}
                            className={`underline ${art.breaking ? 'text-[#DF2525] font-bold' : 'text-neutral-400'}`}
                          >
                            Breaking
                          </button>
                        </td>
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              toggleArticleFlag(art, { status: art.status === 'published' ? 'draft' : 'published' })
                            }
                            className="text-[#00652E] dark:text-[#4ade80] font-semibold hover:underline"
                          >
                            {art.status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingArticle(art)}
                            className="text-neutral-700 dark:text-neutral-300 font-semibold hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteArticle(art.id)}
                            className="text-[#DF2525] font-semibold hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: RSS ENGINE */}
          {activeTab === 'rss' && (
            <div className="space-y-6">
              <form
                onSubmit={addRssSource}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Feed Name</label>
                  <input
                    type="text"
                    required
                    value={newRssName}
                    onChange={(e) => setNewRssName(e.target.value)}
                    placeholder="e.g. PIB Science"
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">RSS / Atom URL</label>
                  <input
                    type="url"
                    required
                    value={newRssUrl}
                    onChange={(e) => setNewRssUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Language &amp; Default Cat</label>
                  <div className="flex gap-2">
                    <select
                      value={newRssLang}
                      onChange={(e) => setNewRssLang(e.target.value as 'en' | 'hi')}
                      className="px-2 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    >
                      <option value="en">EN</option>
                      <option value="hi">HI</option>
                    </select>
                    <select
                      value={newRssCat}
                      onChange={(e) => setNewRssCat(e.target.value)}
                      className="flex-1 px-2 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold">
                  Add Source
                </button>
              </form>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 dark:bg-neutral-800">
                    <tr>
                      <th className="p-3">Source Name</th>
                      <th className="p-3">Feed URL</th>
                      <th className="p-3">Lang</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Imported</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {rssSources.map((src) => (
                      <tr key={src.id}>
                        <td className="p-3 font-semibold">{src.name}</td>
                        <td className="p-3 max-w-xs truncate font-mono-tabular text-neutral-500">{src.feed_url}</td>
                        <td className="p-3 uppercase font-mono-tabular">{src.language}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={async () => {
                              await authFetch(`/api/admin/rss/${src.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ enabled: !src.enabled }),
                              });
                              loadAll();
                            }}
                            className={`font-semibold underline ${src.enabled ? 'text-[#00652E]' : 'text-neutral-400'}`}
                          >
                            {src.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          {src.last_error && <div className="text-[#DF2525] text-[11px] mt-0.5">{src.last_error}</div>}
                        </td>
                        <td className="p-3 font-mono-tabular">{src.imported_count}</td>
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          <button type="button" onClick={() => testRssSource(src.id)} className="text-neutral-700 dark:text-neutral-300 underline">
                            Test
                          </button>
                          <button type="button" onClick={() => retrySingleRss(src.id)} className="text-[#00652E] font-semibold underline inline-flex items-center gap-1">
                            <Play className="w-3 h-3" /> Run
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await authFetch(`/api/admin/rss/${src.id}`, { method: 'DELETE' });
                              loadAll();
                            }}
                            className="text-[#DF2525] underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                <h3 className="text-sm font-bold mb-3">Import History &amp; Failed Imports Log</h3>
                <div className="space-y-2 text-xs">
                  {rssLogs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between py-2 border-b border-neutral-100 dark:border-neutral-800">
                      <div>
                        <span className="font-semibold">{l.source_name}</span> —{' '}
                        <span className={l.status === 'failed' ? 'text-[#DF2525] font-semibold' : 'text-neutral-600 dark:text-neutral-400'}>
                          {l.message}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-neutral-500">{formatIndiaDateTime(l.ran_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PUBLISHING & AI */}
          {activeTab === 'publishing' && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 max-w-3xl space-y-6">
              <div>
                <h2 className="text-lg font-bold">Publishing &amp; Automation Mode</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Control how incoming RSS dispatches are processed. AI checks strictly validate metadata and duplicate overlap without fabricating facts.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    value: 'manual_approval',
                    title: 'Manual Editorial Approval (Recommended)',
                    desc: 'All collected RSS stories enter Pending Review until approved by an editor.',
                  },
                  {
                    value: 'auto_publish',
                    title: 'Automatic Publishing',
                    desc: 'Verified RSS feeds publish immediately after duplicate and URL checks.',
                  },
                  {
                    value: 'auto_publish_ai',
                    title: 'Automatic Publishing with AI Quality Checks',
                    desc: 'Runs Gemini quality & duplicate verification before publishing; flags incomplete stories for review.',
                  },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`block p-4 rounded-lg border cursor-pointer transition-colors ${
                      settings.publishing_mode === opt.value
                        ? 'border-[#00652E] bg-[#EAF5E5]/50 dark:bg-[#00451F]/30'
                        : 'border-neutral-200 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="pub_mode"
                        checked={settings.publishing_mode === opt.value}
                        onChange={() => saveSettings({ publishing_mode: opt.value })}
                      />
                      <span className="text-sm font-bold">{opt.title}</span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 pl-6">{opt.desc}</p>
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Scheduled RSS Collection Interval</label>
                  <select
                    value={settings.rss_interval_minutes || '60'}
                    onChange={(e) => saveSettings({ rss_interval_minutes: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  >
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Every 60 minutes</option>
                    <option value="180">Every 3 hours</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Background Scheduler</label>
                  <select
                    value={settings.rss_auto_enabled || 'true'}
                    onChange={(e) => saveSettings({ rss_auto_enabled: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Paused</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB: EDITIONS */}
          {activeTab === 'editions' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Select Edition Date</label>
                    <input
                      type="date"
                      value={editionDateInput}
                      onChange={(e) => setEditionDateInput(e.target.value)}
                      className="px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => generateEdition()}
                    className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold hover:bg-[#00451F]"
                  >
                    Generate / Regenerate Edition
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => generateEdition(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()))}
                  className="px-4 py-2 rounded border border-[#00652E] text-[#00652E] dark:text-[#4ade80] text-xs font-semibold"
                >
                  Generate Today’s Edition
                </button>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 dark:bg-neutral-800">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Edition Title</th>
                      <th className="p-3">Pages</th>
                      <th className="p-3">Articles</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {editions.map((ed) => (
                      <tr key={ed.id}>
                        <td className="p-3 font-mono-tabular font-semibold">{ed.edition_date}</td>
                        <td className="p-3">{ed.title}</td>
                        <td className="p-3 font-mono-tabular">{ed.page_count}</td>
                        <td className="p-3 font-mono-tabular">{ed.article_count}</td>
                        <td className="p-3 text-right space-x-3 whitespace-nowrap">
                          <a href={ed.pdf_url} target="_blank" rel="noreferrer" className="text-[#00652E] font-semibold underline">
                            Preview HTML
                          </a>
                          <button
                            type="button"
                            onClick={() => downloadEditionPdf(ed)}
                            className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-200 font-semibold underline"
                          >
                            <Download className="w-3 h-3" /> PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEdition(ed)}
                            className="text-[#DF2525] font-semibold underline inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: MIGRATION */}
          {activeTab === 'migration' && <AdminMigrationPanel token={adminToken} onImported={loadAll} />}

          {/* TAB: TAXONOMY (CATEGORIES & STATES) */}
          {activeTab === 'taxonomy' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
                <h2 className="text-base font-bold">Categories ({categories.length})</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await authFetch('/api/admin/categories', {
                      method: 'POST',
                      body: JSON.stringify({ name: newCatName, description: newCatDesc }),
                    });
                    if (res.ok) {
                      setNewCatName('');
                      setNewCatDesc('');
                      flash('Category created.');
                      loadAll();
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Category name"
                    className="flex-1 px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                  <input
                    type="text"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Description"
                    className="flex-1 px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded bg-[#00652E] text-white text-xs font-semibold">
                    Add
                  </button>
                </form>

                <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                  {categories.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{c.name}</span>{' '}
                        <span className="text-neutral-400 font-mono-tabular">({c.article_count ?? 0})</span>
                        <p className="text-neutral-500">{c.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await authFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                          loadAll();
                        }}
                        className="text-[#DF2525] underline"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                <h2 className="text-base font-bold mb-3">All 28 States &amp; 8 Union Territories ({states.length})</h2>
                <div className="grid grid-cols-2 gap-2 max-h-[520px] overflow-y-auto text-xs">
                  {states.map((s) => (
                    <div key={s.id} className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 flex justify-between">
                      <span>{s.name} ({s.code})</span>
                      <span className="font-mono-tabular font-semibold text-[#00652E]">{s.article_count ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CONTACTS & SUBSCRIBERS */}
          {activeTab === 'contacts' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                <h2 className="text-base font-bold mb-3">Contact &amp; Consultation Submissions ({contacts.length})</h2>
                {contacts.length === 0 ? (
                  <p className="text-xs text-neutral-500">No contact submissions received yet.</p>
                ) : (
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                    {contacts.map((c) => (
                      <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-bold">
                            {c.subject} · <span className="font-normal text-neutral-500">{c.inquiry_type}</span>
                          </div>
                          <div className="text-neutral-600 dark:text-neutral-400 mt-0.5">
                            {c.name} ({c.email}{c.phone ? ` · ${c.phone}` : ''}) · {formatIndiaDateTime(c.created_at)}
                          </div>
                          <p className="mt-1 text-neutral-800 dark:text-neutral-200">{c.message}</p>
                        </div>
                        <select
                          value={c.status}
                          onChange={async (e) => {
                            await authFetch(`/api/admin/contacts/${c.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: e.target.value }),
                            });
                            loadAll();
                          }}
                          className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold self-start"
                        >
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">Newsletter Subscribers ({subscribers.length})</h2>
                  <button
                    type="button"
                    onClick={exportSubscribersCsv}
                    className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                  {subscribers.map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between">
                      <span>{s.email}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await authFetch(`/api/admin/subscribers/${s.id}`, { method: 'DELETE' });
                          loadAll();
                        }}
                        className="text-[#DF2525] underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS & ADMIN USERS */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
                <h2 className="text-base font-bold">Portal Settings</h2>
                <div>
                  <label className="block text-xs font-semibold mb-1">Hindi Tagline</label>
                  <input
                    type="text"
                    value={settings.tagline_hi || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, tagline_hi: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">English Tagline</label>
                  <input
                    type="text"
                    value={settings.tagline_en || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, tagline_en: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Primary Admin Email</label>
                  <input
                    type="email"
                    value={settings.admin_email || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, admin_email: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    saveSettings({
                      tagline_hi: settings.tagline_hi || '',
                      tagline_en: settings.tagline_en || '',
                      admin_email: settings.admin_email || 'maheepmedia@gmail.com',
                    })
                  }
                  className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
                >
                  Save Portal Settings
                </button>
              </div>

              {(adminUser.role === 'super_admin' || adminUser.role === 'admin') && (
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00652E]" />
                    <h2 className="text-base font-bold">Editorial Admin Roles</h2>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const res = await authFetch('/api/admin/users', {
                        method: 'POST',
                        body: JSON.stringify({
                          name: newAdminName,
                          email: newAdminEmail,
                          role: newAdminRole,
                          password: newAdminPass,
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) {
                        setError(json.error || 'Could not add user');
                        return;
                      }
                      setNewAdminName('');
                      setNewAdminEmail('');
                      setNewAdminPass('');
                      flash('Admin user added.');
                      loadAll();
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                  >
                    <input
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Full name"
                      className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="Email"
                      className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                    <select
                      value={newAdminRole}
                      onChange={(e) => setNewAdminRole(e.target.value as 'editor' | 'admin' | 'super_admin')}
                      className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      placeholder="Password (min 8 chars)"
                      className="px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                    <button type="submit" className="sm:col-span-2 py-2 rounded bg-[#00652E] text-white text-xs font-semibold">
                      Grant Editorial Access
                    </button>
                  </form>

                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                    {adminUsers.map((u) => (
                      <div key={u.id} className="py-2 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{u.name}</div>
                          <div className="text-neutral-500">{u.email} · {u.role}</div>
                        </div>
                        {u.id !== adminUser.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              await authFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                              loadAll();
                            }}
                            className="text-[#DF2525] underline"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editingArticle !== undefined && (
        <AdminArticleModal
          article={editingArticle}
          categories={categories}
          states={states}
          token={adminToken}
          onClose={() => setEditingArticle(undefined)}
          onSaved={() => {
            setEditingArticle(undefined);
            flash('Article saved successfully.');
            loadAll();
          }}
        />
      )}
    </div>
  );
}
