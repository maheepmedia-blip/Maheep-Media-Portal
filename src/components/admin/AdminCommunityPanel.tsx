import { BarChart3, Bell, Check, MessageSquare, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import type { CommentItem } from '../../types/news.ts';
import { formatIndiaDateTime } from '../../utils/date.ts';

interface AnalyticsPayload {
  dailyViews: Array<{ day: string; views: number }>;
  topArticles: Array<{ id: string; title: string; slug: string; views: number; language: string; category_name: string }>;
  categoryTotals: Array<{ category: string; articles: number; views: number }>;
  languageSplit: Array<{ language: string; count: number; views: number }>;
  adTotals: { impressions: number; clicks: number };
  pushSubscribers: number;
  readerAccounts: number;
}

export function AdminCommunityPanel({ token, onRefreshOverview }: { token: string; onRefreshOverview: () => void }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushUrl, setPushUrl] = useState('/');
  const [pushLang, setPushLang] = useState<'all' | 'en' | 'hi'>('all');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    const [cRes, aRes] = await Promise.all([
      fetch('/api/admin/comments', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (cRes.ok) {
      const cJson = await cRes.json();
      setComments(cJson.comments || []);
    }
    if (aRes.ok) {
      setAnalytics(await aRes.json());
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const moderateComment = async (id: string, status: 'approved' | 'rejected') => {
    await fetch(`/api/admin/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    loadData();
    onRefreshOverview();
  };

  const deleteComment = async (id: string) => {
    await fetch(`/api/admin/comments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
    onRefreshOverview();
  };

  const sendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    const res = await fetch('/api/admin/push/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: pushTitle, body: pushBody, url: pushUrl, language: pushLang }),
    });
    const json = await res.json();
    if (res.ok) {
      setNotice(`Push alert sent to ${json.sent} subscribers (removed ${json.removed} expired).`);
      setPushTitle('');
      setPushBody('');
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3 rounded bg-[#EAF5E5] dark:bg-[#00451F] text-xs font-semibold text-[#00451F] dark:text-[#EAF5E5]">
          {notice}
        </div>
      )}

      {/* Privacy-Safe Analytics Overview */}
      {analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500">Ad Impressions</div>
              <div className="text-2xl font-bold font-mono-tabular">{analytics.adTotals?.impressions ?? 0}</div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500">Ad Clicks</div>
              <div className="text-2xl font-bold font-mono-tabular text-[#00652E]">{analytics.adTotals?.clicks ?? 0}</div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500">Web Push Subscribers</div>
              <div className="text-2xl font-bold font-mono-tabular">{analytics.pushSubscribers}</div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500">Reader Accounts</div>
              <div className="text-2xl font-bold font-mono-tabular">{analytics.readerAccounts}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-[#00652E]" />
                <h3 className="text-sm font-bold">Top Performing Stories</h3>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {analytics.topArticles.map((art) => (
                  <div key={art.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{art.title}</div>
                    <span className="font-mono-tabular text-[#00652E] font-bold shrink-0">{art.views} views</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h3 className="text-sm font-bold mb-3">Category Reach</h3>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {analytics.categoryTotals.map((cat) => (
                  <div key={cat.category} className="py-2 flex items-center justify-between">
                    <span className="font-semibold">{cat.category}</span>
                    <span className="font-mono-tabular text-neutral-500">
                      {cat.articles} stories · <strong className="text-neutral-900 dark:text-white">{cat.views} views</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breaking News Push Broadcast */}
      <form
        onSubmit={sendPush}
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#DF2525]" />
          <h3 className="text-sm font-bold">Broadcast Breaking News Push Notification</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            required
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
            placeholder="Alert headline..."
            className="sm:col-span-2 px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <input
            type="text"
            value={pushUrl}
            onChange={(e) => setPushUrl(e.target.value)}
            placeholder="Target path (e.g. /national)"
            className="px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <select
            value={pushLang}
            onChange={(e) => setPushLang(e.target.value as 'all' | 'en' | 'hi')}
            className="px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          >
            <option value="all">All Readers</option>
            <option value="en">English Readers</option>
            <option value="hi">Hindi Readers</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            placeholder="Concise summary shown in browser notification..."
            className="flex-1 px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-[#DF2525] text-white text-xs font-semibold hover:bg-red-700 shrink-0"
          >
            Send Push Alert
          </button>
        </div>
      </form>

      {/* Moderated Reader Comments */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#00652E]" />
          <h3 className="text-sm font-bold">Moderated Reader Comments ({comments.length})</h3>
        </div>
        {comments.length === 0 ? (
          <p className="text-xs text-neutral-500">No reader comments submitted yet.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
            {comments.map((cm) => (
              <div key={cm.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold">
                    {cm.author_name}{' '}
                    <span className="font-normal text-neutral-500">on "{cm.article_title || 'Article'}"</span>
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        cm.status === 'approved'
                          ? 'bg-[#EAF5E5] text-[#00652E]'
                          : cm.status === 'rejected'
                          ? 'bg-red-50 text-[#DF2525]'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {cm.status}
                    </span>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300">{cm.body}</p>
                  <div className="text-[11px] text-neutral-500 font-mono-tabular">{formatIndiaDateTime(cm.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => moderateComment(cm.id, 'approved')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#00652E] text-white font-semibold"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => moderateComment(cm.id, 'rejected')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-semibold"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteComment(cm.id)}
                    className="p-1.5 text-[#DF2525] hover:underline"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
