import { BarChart3, Bell, CalendarClock, Check, Mail, MessageSquare, Send, Share2, Trash2, Vote, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import type { Article, CommentItem, NewsletterCampaign, PollItem, SocialPostItem } from '../../types/news.ts';
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
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPostItem[]>([]);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Strongly Support, Neutral, Need More Review');
  const pollCategory = 'National Policy';

  // Push alert state
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushUrl, setPushUrl] = useState('/');
  const [pushLang, setPushLang] = useState<'all' | 'en' | 'hi'>('all');

  // Newsletter campaign composer state
  const [campSubject, setCampSubject] = useState('');
  const [campIntro, setCampIntro] = useState('');
  const [campLang, setCampLang] = useState<'all' | 'en' | 'hi'>('all');
  const [sendingCamp, setSendingCamp] = useState(false);

  // Social post scheduler state
  const [socPlatform, setSocPlatform] = useState<'x' | 'whatsapp' | 'facebook' | 'linkedin' | 'telegram'>('x');
  const [socArticleId, setSocArticleId] = useState('');
  const [socMessage, setSocMessage] = useState('');
  const [socUrl, setSocUrl] = useState('');
  const [socScheduledAt, setSocScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 3600_000);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(d)
      .replace(' ', 'T');
  });

  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [cRes, aRes, campRes, socRes, artRes, pollRes] = await Promise.all([
      fetch('/api/admin/comments', { headers }),
      fetch('/api/admin/analytics', { headers }),
      fetch('/api/admin/newsletter/campaigns', { headers }),
      fetch('/api/admin/social-posts', { headers }),
      fetch('/api/admin/articles?status=published', { headers }),
      fetch('/api/admin/polls', { headers }),
    ]);
    if (cRes.ok) setComments((await cRes.json()).comments || []);
    if (aRes.ok) setAnalytics(await aRes.json());
    if (campRes.ok) setCampaigns((await campRes.json()).campaigns || []);
    if (socRes.ok) setSocialPosts((await socRes.json()).posts || []);
    if (artRes.ok) setRecentArticles(((await artRes.json()).articles || []).slice(0, 20));
    if (pollRes.ok) setPolls((await pollRes.json()).polls || []);
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

  const sendCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingCamp(true);
    setNotice('');
    try {
      const res = await fetch('/api/admin/newsletter/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: campSubject, intro_text: campIntro, language: campLang }),
      });
      const json = await res.json();
      if (res.ok) {
        setNotice(`Newsletter campaign queued: ${json.sent} sent, ${json.skipped} skipped (SMTP), ${json.failed} failed across ${json.totalTargets} subscribers.`);
        setCampSubject('');
        setCampIntro('');
        loadData();
      }
    } finally {
      setSendingCamp(false);
    }
  };

  const scheduleSocialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    const isoUtc = socScheduledAt ? new Date(`${socScheduledAt}:00+05:30`).toISOString() : new Date().toISOString();
    const res = await fetch('/api/admin/social-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        platform: socPlatform,
        article_id: socArticleId,
        message: socMessage,
        share_url: socUrl,
        scheduled_at: isoUtc,
      }),
    });
    if (res.ok) {
      setNotice('Social media post scheduled in newsroom queue.');
      setSocMessage('');
      setSocUrl('');
      setSocArticleId('');
      loadData();
    }
  };

  const maxDailyViews = Math.max(1, ...(analytics?.dailyViews || []).map((d) => d.views));

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

          {analytics.dailyViews.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h3 className="text-sm font-bold mb-3">14-Day Readership Trend (IST)</h3>
              <div className="flex items-end gap-2 h-28 pt-2">
                {analytics.dailyViews.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-[10px] font-mono-tabular text-neutral-500">{d.views}</span>
                    <div
                      className="w-full rounded-t bg-[#00652E] dark:bg-[#159B42] transition-all"
                      style={{ height: `${Math.max(8, Math.round((d.views / maxDailyViews) * 72))}px` }}
                      title={`${d.day}: ${d.views} views`}
                    />
                    <span className="text-[10px] font-mono-tabular text-neutral-500 truncate w-full text-center">
                      {d.day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <h3 className="text-sm font-bold mb-3">Category Reach &amp; Language Split</h3>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs mb-3">
                {analytics.categoryTotals.map((cat) => (
                  <div key={cat.category} className="py-2 flex items-center justify-between">
                    <span className="font-semibold">{cat.category}</span>
                    <span className="font-mono-tabular text-neutral-500">
                      {cat.articles} stories · <strong className="text-neutral-900 dark:text-white">{cat.views} views</strong>
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                {analytics.languageSplit.map((l) => (
                  <span key={l.language} className="px-2.5 py-1 rounded bg-[#EAF5E5] dark:bg-neutral-800 font-semibold">
                    {l.language === 'hi' ? 'Hindi' : 'English'}: {l.count} stories · {l.views} views
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Social Media Posts Queue */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-[#00652E]" />
          <h3 className="text-sm font-bold">Scheduled Social Media Posts</h3>
        </div>
        <form onSubmit={scheduleSocialPost} className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
          <select
            value={socPlatform}
            onChange={(e) => setSocPlatform(e.target.value as 'x' | 'whatsapp' | 'facebook' | 'linkedin' | 'telegram')}
            className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          >
            <option value="x">X (Twitter)</option>
            <option value="whatsapp">WhatsApp Channel</option>
            <option value="facebook">Facebook</option>
            <option value="telegram">Telegram</option>
            <option value="linkedin">LinkedIn</option>
          </select>
          <select
            value={socArticleId}
            onChange={(e) => {
              const id = e.target.value;
              setSocArticleId(id);
              const found = recentArticles.find((a) => a.id === id);
              if (found) {
                setSocMessage(`${found.title} — ${found.summary.slice(0, 140)}`);
                setSocUrl(`/news/${found.slug}`);
              }
            }}
            className="sm:col-span-2 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          >
            <option value="">Link an article (optional)...</option>
            {recentArticles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title.slice(0, 65)}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={socScheduledAt}
            onChange={(e) => setSocScheduledAt(e.target.value)}
            className="sm:col-span-2 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            title="Schedule time (IST)"
          />
          <button type="submit" className="px-3 py-2 rounded bg-[#00652E] text-white font-semibold inline-flex items-center justify-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" /> Schedule
          </button>
          <input
            type="text"
            required
            value={socMessage}
            onChange={(e) => setSocMessage(e.target.value)}
            placeholder="Post caption & hashtags..."
            className="sm:col-span-4 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <input
            type="text"
            value={socUrl}
            onChange={(e) => setSocUrl(e.target.value)}
            placeholder="Target article URL (/news/...)"
            className="sm:col-span-2 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
        </form>

        {socialPosts.length > 0 && (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-56 overflow-y-auto">
            {socialPosts.map((sp) => (
              <div key={sp.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="uppercase font-bold text-[#00652E] mr-2">[{sp.platform}]</span>
                  <span
                    className={`mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      sp.status === 'ready'
                        ? 'bg-amber-100 text-amber-800'
                        : sp.status === 'posted'
                        ? 'bg-[#EAF5E5] text-[#00652E]'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600'
                    }`}
                  >
                    {sp.status}
                  </span>
                  <span className="font-medium">{sp.message}</span>
                  <div className="text-[11px] text-neutral-500 font-mono-tabular mt-0.5">
                    IST: {formatIndiaDateTime(sp.scheduled_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sp.status !== 'posted' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/admin/social-posts/${sp.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'posted' }),
                        });
                        loadData();
                      }}
                      className="px-2 py-1 rounded bg-[#00652E] text-white font-semibold"
                    >
                      Mark Posted
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/admin/social-posts/${sp.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      loadData();
                    }}
                    className="text-[#DF2525] p-1"
                    aria-label="Delete scheduled social post"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Newsletter Campaign Composer & Log */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#00652E]" />
          <h3 className="text-sm font-bold">Newsletter Campaign Composer</h3>
        </div>
        <form onSubmit={sendCampaign} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={campSubject}
              onChange={(e) => setCampSubject(e.target.value)}
              placeholder="Campaign subject line (e.g. Weekend Special Edition)..."
              className="sm:col-span-2 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
            <select
              value={campLang}
              onChange={(e) => setCampLang(e.target.value as 'all' | 'en' | 'hi')}
              className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="all">All Confirmed Subscribers</option>
              <option value="en">English Subscribers</option>
              <option value="hi">Hindi Subscribers</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={campIntro}
              onChange={(e) => setCampIntro(e.target.value)}
              placeholder="Editorial intro note included above the latest 5 headlines..."
              className="flex-1 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
            <button
              type="submit"
              disabled={sendingCamp}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-[#00652E] text-white font-semibold shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingCamp ? 'Sending...' : 'Send Campaign'}
            </button>
          </div>
        </form>
        {campaigns.length > 0 && (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-40 overflow-y-auto">
            {campaigns.map((c) => (
              <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{c.subject}</span>{' '}
                  <span className="text-neutral-500">({c.language})</span>
                </div>
                <span className="font-mono-tabular text-neutral-500">
                  Sent: {c.sent_count} · Failed: {c.failed_count} · {formatIndiaDateTime(c.sent_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Reader Opinion Polls Manager */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4 text-[#00652E]" />
          <h3 className="text-sm font-bold">Reader Polls &amp; Opinion Surveys</h3>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const opts = pollOptionsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const res = await fetch('/api/admin/polls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ question: pollQuestion, category: pollCategory, options: opts }),
            });
            if (res.ok) {
              setPollQuestion('');
              setNotice('Reader opinion poll published.');
              loadData();
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
        >
          <input
            type="text"
            required
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Poll question for readers..."
            className="sm:col-span-3 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <input
            type="text"
            required
            value={pollOptionsText}
            onChange={(e) => setPollOptionsText(e.target.value)}
            placeholder="Comma-separated options..."
            className="sm:col-span-2 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
          <button type="submit" className="px-3 py-2 rounded bg-[#00652E] text-white font-semibold">
            Launch Poll
          </button>
        </form>
        {polls.length > 0 && (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {polls.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.question}</div>
                  <div className="text-neutral-500">
                    {p.options.map((o) => `${o.label} (${o.votes})`).join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/admin/polls/${p.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    loadData();
                  }}
                  className="text-[#DF2525] p-1"
                  aria-label="Delete poll"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
