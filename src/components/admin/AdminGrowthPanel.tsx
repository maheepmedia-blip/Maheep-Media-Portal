import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentGuide } from '../../types/news.ts';

interface AdminGrowthPanelProps {
  token: string;
  settings: Record<string, string>;
  onRefresh: () => void;
}

interface GrowthStats {
  funnel: {
    pageViews: number;
    articleReads: number;
    epaperOpens: number;
    newsletterSignups: number;
    readerSignups: number;
    shareClicks: number;
    pwaInstalls: number;
    adClicks: number;
    conversions: number;
    conversionRate: number;
  };
  utmCampaigns: Array<{
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    events: number;
    conversions: number;
  }>;
  seoHealth: {
    totalPublished: number;
    missingImages: number;
    shortSummaries: number;
    news48hCount: number;
    statesCovered: number;
    totalStates: number;
    guidesCount: number;
  };
}

type GrowthSubTab = 'cro' | 'sem' | 'seo' | 'content' | 'smo';

export function AdminGrowthPanel({ token, settings, onRefresh }: AdminGrowthPanelProps) {
  const [subTab, setSubTab] = useState<GrowthSubTab>('cro');
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [guides, setGuides] = useState<ContentGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  // CRO + Local SEO + SEM + ASO/PLO editable settings
  const [croEnabled, setCroEnabled] = useState(settings.cro_sticky_bar_enabled !== 'false');
  const [croHeadline, setCroHeadline] = useState(
    settings.cro_cta_headline || 'Read Today’s Verified 6 AM E-Paper & Get Instant India Alerts',
  );
  const [croButton, setCroButton] = useState(settings.cro_cta_button || 'Open Morning E-Paper');
  const [localCity, setLocalCity] = useState(settings.local_seo_hq_city || 'New Delhi');
  const [localRegion, setLocalRegion] = useState(settings.local_seo_region || 'Delhi NCR, Uttar Pradesh & All India');
  const [googleAdsId, setGoogleAdsId] = useState(settings.sem_google_ads_id || '');

  // SEM PPC Ad Builder state
  const [ppcPath, setPpcPath] = useState('/epaper');
  const [ppcSource, setPpcSource] = useState('google');
  const [ppcMedium, setPpcMedium] = useState('cpc');
  const [ppcCampaign, setPpcCampaign] = useState('india_epaper_search');
  const [ppcTerm, setPpcTerm] = useState('hindi epaper daily');
  const [ppcHeadline, setPpcHeadline] = useState('Maheep News — Today’s 6 AM India E-Paper');
  const [ppcDesc, setPpcDesc] = useState(
    'Verified national & 36-state coverage in Hindi & English. Zero paywall, AI summary & instant PDF download.',
  );

  // SMO Channel UTM Builder state
  const [smoPath, setSmoPath] = useState('/guides');
  const [smoCampaign, setSmoCampaign] = useState('citizen_awareness');

  // Content Marketing Guide Editor state
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [guideTitle, setGuideTitle] = useState('');
  const [guideType, setGuideType] = useState<'guide' | 'explainer' | 'video' | 'checklist'>('guide');
  const [guideCategory, setGuideCategory] = useState('Citizen Guide');
  const [guideLang, setGuideLang] = useState<'en' | 'hi'>('en');
  const [guideReadMins, setGuideReadMins] = useState(5);
  const [guideSummary, setGuideSummary] = useState('');
  const [guideBody, setGuideBody] = useState('');
  const [guideVideoUrl, setGuideVideoUrl] = useState('');
  const [guideImageUrl, setGuideImageUrl] = useState('');
  const [guideAuthor, setGuideAuthor] = useState('Maheep Editorial Desk');
  const [guidePublished, setGuidePublished] = useState(true);

  useEffect(() => {
    setCroEnabled(settings.cro_sticky_bar_enabled !== 'false');
    if (settings.cro_cta_headline) setCroHeadline(settings.cro_cta_headline);
    if (settings.cro_cta_button) setCroButton(settings.cro_cta_button);
    if (settings.local_seo_hq_city) setLocalCity(settings.local_seo_hq_city);
    if (settings.local_seo_region) setLocalRegion(settings.local_seo_region);
    if (settings.sem_google_ads_id !== undefined) setGoogleAdsId(settings.sem_google_ads_id);
  }, [settings]);

  const authFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      }),
    [token],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, guidesRes] = await Promise.all([
        authFetch('/api/admin/growth-stats'),
        authFetch('/api/admin/guides'),
      ]);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (guidesRes.ok) {
        const gj = await guidesRes.json();
        setGuides(gj.guides || []);
      }
    } catch {
      setError('Could not load growth telemetry.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const saveGrowthSettings = async (payload: Record<string, string>) => {
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/admin/growth-settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Failed to save growth settings.');
        return;
      }
      flash('Growth & marketing settings saved live.');
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const resetGuideForm = () => {
    setEditingGuideId(null);
    setGuideTitle('');
    setGuideType('guide');
    setGuideCategory('Citizen Guide');
    setGuideLang('en');
    setGuideReadMins(5);
    setGuideSummary('');
    setGuideBody('');
    setGuideVideoUrl('');
    setGuideImageUrl('');
    setGuideAuthor('Maheep Editorial Desk');
    setGuidePublished(true);
  };

  const handleSaveGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: guideTitle,
        guide_type: guideType,
        category: guideCategory,
        language: guideLang,
        read_minutes: guideReadMins,
        summary: guideSummary,
        body: guideBody,
        video_url: guideVideoUrl,
        image_url: guideImageUrl,
        author: guideAuthor,
        published: guidePublished,
      };
      const url = editingGuideId ? `/api/admin/guides/${editingGuideId}` : '/api/admin/guides';
      const method = editingGuideId ? 'PATCH' : 'POST';
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not save guide.');
        return;
      }
      flash(editingGuideId ? 'Content guide updated.' : 'New content guide published.');
      resetGuideForm();
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const portalOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://maheepmedia.com';

  const ppcFinalUrl = useMemo(() => {
    const cleanPath = ppcPath.startsWith('/') ? ppcPath : `/${ppcPath}`;
    const url = new URL(cleanPath, portalOrigin);
    if (ppcSource) url.searchParams.set('utm_source', ppcSource);
    if (ppcMedium) url.searchParams.set('utm_medium', ppcMedium);
    if (ppcCampaign) url.searchParams.set('utm_campaign', ppcCampaign);
    if (ppcTerm) url.searchParams.set('utm_term', ppcTerm);
    return url.toString();
  }, [portalOrigin, ppcPath, ppcSource, ppcMedium, ppcCampaign, ppcTerm]);

  const smoLinks = useMemo(() => {
    const cleanPath = smoPath.startsWith('/') ? smoPath : `/${smoPath}`;
    const channels = [
      { id: 'whatsapp', label: 'WhatsApp Broadcast', medium: 'social_messaging' },
      { id: 'x', label: 'X (Twitter)', medium: 'social_feed' },
      { id: 'facebook', label: 'Facebook Page', medium: 'social_feed' },
      { id: 'linkedin', label: 'LinkedIn', medium: 'social_professional' },
      { id: 'telegram', label: 'Telegram Channel', medium: 'social_messaging' },
    ];
    return channels.map((ch) => {
      const url = new URL(cleanPath, portalOrigin);
      url.searchParams.set('utm_source', ch.id);
      url.searchParams.set('utm_medium', ch.medium);
      url.searchParams.set('utm_campaign', smoCampaign || 'portal_share');
      return { ...ch, url: url.toString() };
    });
  }, [portalOrigin, smoPath, smoCampaign]);

  const subTabs: Array<{ id: GrowthSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'cro', label: 'CRO & Funnel', icon: TrendingUp },
    { id: 'sem', label: 'SEM / Paid Ads', icon: Megaphone },
    { id: 'seo', label: 'Technical & Local SEO', icon: Search },
    { id: 'content', label: 'Content Marketing', icon: Sparkles },
    { id: 'smo', label: 'SMO Social Links', icon: Share2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-editorial text-2xl font-bold">Growth, SEO, SEM, CRO & SMO Suite</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage conversion bars, PPC UTM attribution, sitemaps & local geo SEO, citizen guides, and social sharing links.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Metrics
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Sub-navigation pills */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {subTabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                active
                  ? 'bg-[#00652E] text-white'
                  : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. CRO & UXO FUNNEL */}
      {subTab === 'cro' && (
        <div className="space-y-5">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '30d Page Views', value: stats.funnel.pageViews, sub: `${stats.funnel.articleReads} article reads` },
                { label: 'E-Paper Opens', value: stats.funnel.epaperOpens, sub: `${stats.funnel.shareClicks} social shares` },
                { label: 'Total Conversions', value: stats.funnel.conversions, sub: `${stats.funnel.newsletterSignups} email · ${stats.funnel.readerSignups} reader signups` },
                { label: 'Conversion Rate', value: `${stats.funnel.conversionRate}%`, sub: `${stats.funnel.adClicks} sponsor clicks` },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4"
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500">{card.label}</div>
                  <div className="text-2xl font-bold font-mono-tabular mt-1 text-[#00652E] dark:text-[#4ade80]">
                    {card.value}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">{card.sub}</div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-bold">Conversion Rate Optimization (CRO) Homepage Strip</h2>
            <p className="text-xs text-neutral-500">
              Controls the high-visibility reader action bar on the homepage designed to convert casual visitors into daily E-Paper and newsletter readers.
            </p>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={croEnabled}
                onChange={(e) => setCroEnabled(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Enable CRO Conversion Strip on Homepage
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">CTA Headline</label>
                <input
                  type="text"
                  value={croHeadline}
                  onChange={(e) => setCroHeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Primary Button Label</label>
                <input
                  type="text"
                  value={croButton}
                  onChange={(e) => setCroButton(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                saveGrowthSettings({
                  cro_sticky_bar_enabled: croEnabled ? 'true' : 'false',
                  cro_cta_headline: croHeadline,
                  cro_cta_button: croButton,
                })
              }
              className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold hover:bg-[#004d23] disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save CRO Configuration'}
            </button>
          </div>
        </div>
      )}

      {/* 2. SEM / PPC AD BUILDER & UTM ATTRIBUTION */}
      {subTab === 'sem' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-bold">SEM (Search Engine Marketing) PPC Snippet & UTM Builder</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Landing Path</label>
                    <input
                      type="text"
                      value={ppcPath}
                      onChange={(e) => setPpcPath(e.target.value)}
                      placeholder="/epaper"
                      className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Google Ads Conversion ID (Optional)</label>
                    <input
                      type="text"
                      value={googleAdsId}
                      onChange={(e) => setGoogleAdsId(e.target.value)}
                      placeholder="AW-XXXXXXXXXX"
                      className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">utm_source</label>
                    <input
                      type="text"
                      value={ppcSource}
                      onChange={(e) => setPpcSource(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">utm_medium</label>
                    <input
                      type="text"
                      value={ppcMedium}
                      onChange={(e) => setPpcMedium(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">utm_campaign</label>
                    <input
                      type="text"
                      value={ppcCampaign}
                      onChange={(e) => setPpcCampaign(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">utm_term</label>
                    <input
                      type="text"
                      value={ppcTerm}
                      onChange={(e) => setPpcTerm(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Search Ad Headline ({ppcHeadline.length}/60)</label>
                  <input
                    type="text"
                    value={ppcHeadline}
                    onChange={(e) => setPpcHeadline(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Search Ad Description ({ppcDesc.length}/160)</label>
                  <textarea
                    rows={2}
                    value={ppcDesc}
                    onChange={(e) => setPpcDesc(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveGrowthSettings({ sem_google_ads_id: googleAdsId })}
                  className="px-3.5 py-1.5 rounded bg-[#00652E] text-white text-xs font-semibold"
                >
                  Save Google Ads ID
                </button>
              </div>

              {/* Google Search Ad Preview */}
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Live Google Search Ad Preview
                </div>
                <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 space-y-1.5">
                  <div className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200">
                    Sponsored · {portalOrigin.replace(/^https?:\/\//, '')}
                    {ppcPath}
                  </div>
                  <div className="text-base font-semibold text-blue-700 dark:text-blue-400 leading-snug">
                    {ppcHeadline || 'Maheep News Portal'}
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{ppcDesc}</p>
                </div>

                <div className="p-3 rounded bg-neutral-100 dark:bg-neutral-800/70 space-y-1.5">
                  <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                    Tagged PPC Final URL (Ready for Google / Bing Ads):
                  </div>
                  <div className="text-[11px] font-mono break-all text-neutral-700 dark:text-neutral-200">{ppcFinalUrl}</div>
                  <button
                    type="button"
                    onClick={() => copyText('ppc', ppcFinalUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold"
                  >
                    {copiedKey === 'ppc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'ppc' ? 'Copied PPC URL' : 'Copy Tagged URL'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
            <h3 className="text-sm font-bold mb-3">30-Day UTM Campaign Attribution</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Medium</th>
                    <th className="py-2 pr-3">Campaign</th>
                    <th className="py-2 pr-3 text-right">Events</th>
                    <th className="py-2 text-right">Conversions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {(stats?.utmCampaigns || []).map((row, idx) => (
                    <tr key={`${row.utm_source}-${row.utm_campaign}-${idx}`}>
                      <td className="py-2 pr-3 font-semibold">{row.utm_source}</td>
                      <td className="py-2 pr-3 text-neutral-500">{row.utm_medium}</td>
                      <td className="py-2 pr-3">{row.utm_campaign}</td>
                      <td className="py-2 pr-3 text-right font-mono-tabular">{row.events}</td>
                      <td className="py-2 text-right font-mono-tabular font-semibold text-[#00652E] dark:text-[#4ade80]">
                        {row.conversions}
                      </td>
                    </tr>
                  ))}
                  {(!stats || stats.utmCampaigns.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-neutral-500">
                        UTM traffic will appear here as visitors arrive from search ads, WhatsApp, and social campaigns.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. TECHNICAL SEO & LOCAL SEO */}
      {subTab === 'seo' && (
        <div className="space-y-5">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="text-[11px] uppercase font-semibold text-neutral-500">Indexed Articles</div>
                <div className="text-2xl font-bold font-mono-tabular mt-1">{stats.seoHealth.totalPublished}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{stats.seoHealth.news48hCount} in Google News 48h feed</div>
              </div>
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="text-[11px] uppercase font-semibold text-neutral-500">Local State Coverage</div>
                <div className="text-2xl font-bold font-mono-tabular mt-1 text-[#00652E] dark:text-[#4ade80]">
                  {stats.seoHealth.statesCovered} / {stats.seoHealth.totalStates}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">All 36 States/UTs in sitemap</div>
              </div>
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="text-[11px] uppercase font-semibold text-neutral-500">Missing Images</div>
                <div className="text-2xl font-bold font-mono-tabular mt-1 text-amber-600">{stats.seoHealth.missingImages}</div>
                <div className="text-[11px] text-neutral-500 mt-1">Add cover images for Rich Snippets</div>
              </div>
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="text-[11px] uppercase font-semibold text-neutral-500">Short Meta Summaries</div>
                <div className="text-2xl font-bold font-mono-tabular mt-1 text-amber-600">{stats.seoHealth.shortSummaries}</div>
                <div className="text-[11px] text-neutral-500 mt-1">Under 50 chars meta description</div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#00652E]" /> Technical Sitemaps & Crawler Endpoints
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Robots.txt Directives', path: '/robots.txt' },
                { label: 'Full XML Sitemap (Articles + States + Guides)', path: '/sitemap.xml' },
                { label: 'Google News 48h XML Sitemap', path: '/sitemap-news.xml' },
              ].map((ep) => (
                <a
                  key={ep.path}
                  href={ep.path}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded border border-neutral-200 dark:border-neutral-700 hover:border-[#00652E] flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold">{ep.label}</div>
                    <div className="text-[11px] text-neutral-500 font-mono">{ep.path}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[#00652E] shrink-0" />
                </a>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-bold">Local SEO & Regional Geo Targeting</h2>
            <p className="text-xs text-neutral-500">
              Injected into <code className="px-1 bg-neutral-100 dark:bg-neutral-800 rounded">NewsMediaOrganization</code> JSON-LD and regional meta tags alongside dynamic per-state landing pages under <code className="px-1 bg-neutral-100 dark:bg-neutral-800 rounded">/states/:slug</code>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Newsroom HQ City (geo.placename)</label>
                <input
                  type="text"
                  value={localCity}
                  onChange={(e) => setLocalCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Primary Coverage Region</label>
                <input
                  type="text"
                  value={localRegion}
                  onChange={(e) => setLocalRegion(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                saveGrowthSettings({
                  local_seo_hq_city: localCity,
                  local_seo_region: localRegion,
                })
              }
              className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
            >
              {saving ? 'Saving...' : 'Save Local SEO Settings'}
            </button>
          </div>
        </div>
      )}

      {/* 4. CONTENT MARKETING STUDIO */}
      {subTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSaveGuide}
            className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3 h-fit"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{editingGuideId ? 'Edit Content Guide' : 'Publish New Guide / Video'}</h2>
              {editingGuideId && (
                <button type="button" onClick={resetGuideForm} className="text-xs text-[#DF2525] underline">
                  Cancel Edit
                </button>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Title</label>
              <input
                type="text"
                required
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                placeholder="e.g. How to Verify Viral WhatsApp Videos in 60 Seconds"
                className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Format</label>
                <select
                  value={guideType}
                  onChange={(e) => setGuideType(e.target.value as 'guide' | 'explainer' | 'video' | 'checklist')}
                  className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                >
                  <option value="guide">Guide</option>
                  <option value="explainer">Explainer</option>
                  <option value="checklist">Checklist</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Language</label>
                <select
                  value={guideLang}
                  onChange={(e) => setGuideLang(e.target.value as 'en' | 'hi')}
                  className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Read Mins</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={guideReadMins}
                  onChange={(e) => setGuideReadMins(Number(e.target.value) || 5)}
                  className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Category</label>
                <input
                  type="text"
                  value={guideCategory}
                  onChange={(e) => setGuideCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Author</label>
                <input
                  type="text"
                  value={guideAuthor}
                  onChange={(e) => setGuideAuthor(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">SEO Summary</label>
              <textarea
                rows={2}
                required
                value={guideSummary}
                onChange={(e) => setGuideSummary(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Full Guide Content (Paragraphs / Numbered Steps)</label>
              <textarea
                rows={5}
                required
                value={guideBody}
                onChange={(e) => setGuideBody(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold mb-1">YouTube Video URL (Optional)</label>
                <input
                  type="url"
                  value={guideVideoUrl}
                  onChange={(e) => setGuideVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Cover Image URL (Optional)</label>
                <input
                  type="url"
                  value={guideImageUrl}
                  onChange={(e) => setGuideImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={guidePublished}
                onChange={(e) => setGuidePublished(e.target.checked)}
              />
              Publish immediately to /guides & sitemap.xml
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 rounded bg-[#00652E] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> {editingGuideId ? 'Update Guide' : 'Publish Content Guide'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Published Evergreen Guides & Videos ({guides.length})</h2>
              <a
                href="/guides"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] inline-flex items-center gap-1 hover:underline"
              >
                Open Public /guides Hub <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {guides.map((g) => (
                <div key={g.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase">
                      <span className="px-1.5 py-0.5 rounded bg-[#EAF5E5] text-[#00652E]">{g.guide_type}</span>
                      <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">{g.language}</span>
                      <span className="text-neutral-500">{g.category} · {g.views} views · {g.shares} shares</span>
                    </div>
                    <div className="font-semibold text-sm mt-1">{g.title}</div>
                    <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{g.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGuideId(g.id);
                        setGuideTitle(g.title);
                        setGuideType(g.guide_type);
                        setGuideCategory(g.category);
                        setGuideLang(g.language);
                        setGuideReadMins(g.read_minutes);
                        setGuideSummary(g.summary);
                        setGuideBody(g.body);
                        setGuideVideoUrl(g.video_url || '');
                        setGuideImageUrl(g.image_url || '');
                        setGuideAuthor(g.author || 'Maheep Editorial Desk');
                        setGuidePublished(Boolean(g.published));
                      }}
                      className="text-xs font-semibold text-[#00652E] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await authFetch(`/api/admin/guides/${g.id}`, { method: 'DELETE' });
                        flash('Guide removed.');
                        loadData();
                      }}
                      className="text-[#DF2525] p-1 hover:bg-red-50 rounded"
                      title="Delete guide"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. SMO SOCIAL MEDIA LINK GENERATOR */}
      {subTab === 'smo' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          <h2 className="text-base font-bold">Social Media Optimization (SMO) — Tracked Share Links</h2>
          <p className="text-xs text-neutral-500">
            Generate platform-specific UTM links for WhatsApp channels, X, Facebook, LinkedIn, and Telegram so referral traffic and reader signups are accurately attributed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1">Target Portal Path</label>
              <input
                type="text"
                value={smoPath}
                onChange={(e) => setSmoPath(e.target.value)}
                placeholder="/epaper or /article/..."
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Campaign Tag (utm_campaign)</label>
              <input
                type="text"
                value={smoCampaign}
                onChange={(e) => setSmoCampaign(e.target.value)}
                placeholder="morning_edition"
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {smoLinks.map((item) => (
              <div key={item.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-[11px] font-mono text-neutral-500 break-all">{item.url}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(`smo-${item.id}`, item.url)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
                >
                  {copiedKey === `smo-${item.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === `smo-${item.id}` ? 'Copied' : 'Copy Link'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
