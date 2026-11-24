import { ExternalLink, Megaphone, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import React, { useState } from 'react';
import type { AdPlacement, Advertisement } from '../../types/news.ts';

interface AdminAdsPanelProps {
  token: string;
  ads: Advertisement[];
  onRefresh: () => void;
}

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  header_banner: 'Homepage Top Leaderboard',
  homepage_mid: 'Homepage Mid-Page Banner',
  sidebar: 'Homepage Right Sidebar Card',
  article_inline: 'Article Page Inline Sponsor',
  epaper_banner: 'E-Paper Reader Banner',
};

export function AdminAdsPanel({ token, ads, onRefresh }: AdminAdsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [placement, setPlacement] = useState<AdPlacement>('sidebar');
  const [language, setLanguage] = useState<'all' | 'en' | 'hi'>('all');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [description, setDescription] = useState('');
  const [ctaText, setCtaText] = useState('Learn More');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setAdvertiser('');
    setPlacement('sidebar');
    setLanguage('all');
    setImageUrl('');
    setTargetUrl('');
    setDescription('');
    setCtaText('Learn More');
    setStartDate('');
    setEndDate('');
    setActive(true);
  };

  const loadForEdit = (ad: Advertisement) => {
    setEditingId(ad.id);
    setTitle(ad.title);
    setAdvertiser(ad.advertiser || '');
    setPlacement(ad.placement);
    setLanguage(ad.language);
    setImageUrl(ad.image_url || '');
    setTargetUrl(ad.target_url || '');
    setDescription(ad.description || '');
    setCtaText(ad.cta_text || 'Learn More');
    setStartDate(ad.start_date || '');
    setEndDate(ad.end_date || '');
    setActive(Boolean(ad.active));
    setError('');
    setNotice('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setImageUrl(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banner upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        title,
        advertiser,
        placement,
        language,
        image_url: imageUrl,
        target_url: targetUrl,
        description,
        cta_text: ctaText,
        start_date: startDate,
        end_date: endDate,
        active,
      };
      const endpoint = editingId ? `/api/admin/ads/${editingId}` : '/api/admin/ads';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save advertisement');

      setNotice(editingId ? 'Advertisement updated.' : 'New advertisement published to portal.');
      resetForm();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save advertisement');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Advertisement) => {
    setError('');
    const res = await fetch(`/api/admin/ads/${ad.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ active: !ad.active }),
    });
    if (res.ok) {
      onRefresh();
    }
  };

  const deleteAd = async (ad: Advertisement) => {
    if (!window.confirm(`Delete advertisement "${ad.title}"?`)) return;
    const res = await fetch(`/api/admin/ads/${ad.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      if (editingId === ad.id) resetForm();
      setNotice('Advertisement deleted.');
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Create / Edit Ad Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#00652E]" />
            <div>
              <h2 className="text-base font-bold">
                {editingId ? 'Edit Advertisement' : 'Create New Advertisement'}
              </h2>
              <p className="text-xs text-neutral-500">
                Publish sponsored banners across Homepage, Article Pages, and the E-Paper Reader.
              </p>
            </div>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {notice && (
          <div className="p-3 rounded bg-[#EAF5E5] dark:bg-[#00451F]/40 border border-[#00652E]/30 text-xs font-medium text-[#00451F] dark:text-[#EAF5E5]">
            {notice}
          </div>
        )}
        {error && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1">Ad Headline / Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Admissions Open 2026 — National Skill Scholarship"
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Advertiser / Sponsor Name</label>
            <input
              type="text"
              value={advertiser}
              onChange={(e) => setAdvertiser(e.target.value)}
              placeholder="e.g. Bharat Tech Institute"
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Placement Slot *</label>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as AdPlacement)}
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              {(Object.keys(PLACEMENT_LABELS) as AdPlacement[]).map((key) => (
                <option key={key} value={key}>
                  {PLACEMENT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Edition Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'all' | 'en' | 'hi')}
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="all">All Editions (Hindi &amp; English)</option>
              <option value="en">English Edition Only</option>
              <option value="hi">Hindi Edition Only (हिन्दी)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">CTA Button Text</label>
            <input
              type="text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Learn More"
              maxLength={40}
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1">Banner Image URL or Upload</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... or upload an image file"
                className="flex-1 px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer hover:border-[#00652E] whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload Banner'}</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Destination Target URL</label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com or /contact"
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1">Promotional Summary (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short 1-line message shown alongside the ad headline"
              maxLength={300}
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold mb-1">Start Date (IST)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">End Date (IST)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
        </div>

        {(title || imageUrl) && (
          <div className="p-4 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950/60">
            <div className="text-[11px] font-medium text-neutral-500 mb-2">
              Live Preview · Advertisement · विज्ञापन {advertiser ? `· ${advertiser}` : ''}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={title || 'Ad preview'}
                    className="w-24 h-14 object-cover rounded border border-neutral-200 dark:border-neutral-700"
                  />
                )}
                <div>
                  <div className="font-editorial text-sm font-bold">{title || 'Headline preview'}</div>
                  {description && <div className="text-xs text-neutral-600 dark:text-neutral-400">{description}</div>}
                </div>
              </div>
              {targetUrl && (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#00652E] text-white text-xs font-semibold self-start">
                  {ctaText || 'Learn More'} <ExternalLink className="w-3 h-3" />
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Active (Display immediately on selected slot)</span>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Publish Advertisement'}
          </button>
        </div>
      </form>

      {/* Active & Scheduled Ads Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-bold">Configured Advertisements ({ads.length})</h3>
          <span className="text-xs text-neutral-500">
            Active ads appear automatically on their assigned portal slots
          </span>
        </div>

        {ads.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            No advertisements configured yet. Create your first sponsor banner above.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <tr>
                <th className="p-3">Ad Creative</th>
                <th className="p-3">Placement</th>
                <th className="p-3">Lang / Schedule</th>
                <th className="p-3">Views / Clicks</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {ads.map((ad) => {
                const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={ad.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="p-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        {ad.image_url && (
                          <img
                            src={ad.image_url}
                            alt={ad.title}
                            className="w-16 h-10 object-cover rounded border border-neutral-200 dark:border-neutral-700 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                            {ad.title}
                          </div>
                          <div className="text-neutral-500 truncate">
                            {ad.advertiser || 'Direct Sponsor'}
                            {ad.target_url ? ` · ${ad.target_url}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-medium">{PLACEMENT_LABELS[ad.placement]}</td>
                    <td className="p-3 font-mono-tabular">
                      <div className="uppercase">{ad.language}</div>
                      {(ad.start_date || ad.end_date) && (
                        <div className="text-[11px] text-neutral-500">
                          {ad.start_date || 'Now'} → {ad.end_date || '∞'}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono-tabular">
                      <div>{ad.impressions} views</div>
                      <div className="text-neutral-500">
                        {ad.clicks} clicks ({ctr}%)
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(ad)}
                        className={`font-semibold underline ${
                          ad.active ? 'text-[#00652E] dark:text-[#4ade80]' : 'text-neutral-400'
                        }`}
                      >
                        {ad.active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="p-3 text-right space-x-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => loadForEdit(ad)}
                        className="inline-flex items-center gap-1 font-semibold text-neutral-700 dark:text-neutral-200 hover:underline"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAd(ad)}
                        className="inline-flex items-center gap-1 font-semibold text-[#DF2525] hover:underline"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
