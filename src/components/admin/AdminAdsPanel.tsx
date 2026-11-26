import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  ExternalLink,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  auth,
  signInFirebaseAdminWithGoogle,
  signOutFirebaseAdmin,
} from '../../firebase.ts';
import {
  AD_LIMITS,
  createAdInFirestore,
  deleteAdFromFirestore,
  fetchAllAdsFromFirestore,
  updateAdInFirestore,
} from '../../services/adsFirestore.ts';
import type { AdPlacement, Advertisement } from '../../types/news.ts';

interface AdminAdsPanelProps {
  token: string;
  ads: Advertisement[];
  onRefresh: () => void;
}

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  all_slots: 'Website & E-Paper (Show Everywhere)',
  header_banner: 'Homepage Top Leaderboard',
  homepage_mid: 'Homepage Mid-Page Banner',
  sidebar: 'Homepage Right Sidebar Card',
  article_inline: 'Article Page Inline Sponsor',
  epaper_banner: 'E-Paper Reader & Broadsheet',
};

export function AdminAdsPanel({ token, ads, onRefresh }: AdminAdsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [placement, setPlacement] = useState<AdPlacement>('all_slots');
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

  // Firebase Cloud Sync state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [cloudAds, setCloudAds] = useState<Advertisement[]>([]);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatusMsg, setCloudStatusMsg] = useState('');
  const hasSyncedOnceRef = useRef(false);

  const isVerifiedCloudAdmin = Boolean(
    firebaseUser && firebaseUser.emailVerified && firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL,
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCloudAds([]);
        hasSyncedOnceRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const syncWithCloud = useCallback(async () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified || auth.currentUser.email !== BOOTSTRAP_ADMIN_EMAIL) {
      return;
    }
    setCloudSyncing(true);
    setError('');
    try {
      const firestoreList = await fetchAllAdsFromFirestore();
      const cloudMap = new Map(firestoreList.map((a) => [a.id, a]));

      // 1) Push any SQLite-only ads up to Cloud Firestore so they survive container restarts
      for (const localAd of ads) {
        if (!cloudMap.has(localAd.id)) {
          await createAdInFirestore({
            id: localAd.id,
            title: localAd.title,
            advertiser: localAd.advertiser,
            placement: localAd.placement,
            image_url: localAd.image_url,
            target_url: localAd.target_url,
            description: localAd.description,
            cta_text: localAd.cta_text,
            language: localAd.language,
            active: Boolean(localAd.active),
            start_date: localAd.start_date,
            end_date: localAd.end_date,
            impressions: localAd.impressions,
            clicks: localAd.clicks,
          });
        }
      }

      // 2) Re-fetch merged Cloud Firestore list and restore into SQLite for server printable HTML
      const refreshedCloud = await fetchAllAdsFromFirestore();
      setCloudAds(refreshedCloud);

      if (refreshedCloud.length > 0 && token) {
        const res = await fetch('/api/admin/ads/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ads: refreshedCloud }),
        });
        if (res.ok) {
          onRefresh();
        }
      }

      setCloudStatusMsg(
        `Cloud Firestore synced (${refreshedCloud.length} advertisement${refreshedCloud.length === 1 ? '' : 's'} backed up permanently).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cloud sync failed');
    } finally {
      setCloudSyncing(false);
    }
  }, [ads, onRefresh, token]);

  useEffect(() => {
    if (isVerifiedCloudAdmin && !hasSyncedOnceRef.current) {
      hasSyncedOnceRef.current = true;
      void syncWithCloud();
    }
  }, [isVerifiedCloudAdmin, syncWithCloud]);

  // Display merged list (Firestore source of truth when connected, merged with SQLite ads)
  const displayedAds: Advertisement[] = React.useMemo(() => {
    const byId = new Map<string, Advertisement>();
    for (const a of ads) byId.set(a.id, a);
    for (const c of cloudAds) byId.set(c.id, c);
    return Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [ads, cloudAds]);

  const handleConnectGoogle = async () => {
    setError('');
    try {
      const result = await signInFirebaseAdminWithGoogle();
      if (result.user.email !== BOOTSTRAP_ADMIN_EMAIL) {
        setError(
          `Signed in as ${result.user.email}, but Cloud Firestore ad writes are restricted to ${BOOTSTRAP_ADMIN_EMAIL}.`,
        );
      } else {
        hasSyncedOnceRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setAdvertiser('');
    setPlacement('all_slots');
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
      const adId = editingId || `ad-${crypto.randomUUID().slice(0, 10)}`;
      const payload = {
        id: adId,
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

      let savedCloud = false;
      if (isVerifiedCloudAdmin) {
        const existingAd = displayedAds.find((a) => a.id === adId);
        if (editingId && existingAd && cloudAds.some((c) => c.id === adId)) {
          await updateAdInFirestore(adId, payload, existingAd);
        } else {
          await createAdInFirestore(payload);
        }
        savedCloud = true;
        const refreshedCloud = await fetchAllAdsFromFirestore();
        setCloudAds(refreshedCloud);
      }

      const existsInSql = ads.some((a) => a.id === adId);
      const endpoint = editingId && existsInSql ? `/api/admin/ads/${adId}` : '/api/admin/ads';
      const method = editingId && existsInSql ? 'PATCH' : 'POST';

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

      setNotice(
        savedCloud
          ? editingId
            ? 'Advertisement updated in Cloud Firestore & Portal.'
            : 'Advertisement published permanently to Cloud Firestore & Portal.'
          : editingId
          ? 'Advertisement updated on server. Connect Google Cloud Sync above so it persists across PC restarts.'
          : 'Advertisement published on server. Connect Google Cloud Sync above so it persists across PC restarts.',
      );
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
    const nextActive = !ad.active;
    try {
      if (isVerifiedCloudAdmin) {
        if (cloudAds.some((c) => c.id === ad.id)) {
          await updateAdInFirestore(ad.id, { active: nextActive }, ad);
        } else {
          await createAdInFirestore({ ...ad, active: nextActive });
        }
        setCloudAds(await fetchAllAdsFromFirestore());
      }

      if (ads.some((a) => a.id === ad.id)) {
        await fetch(`/api/admin/ads/${ad.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active: nextActive }),
        });
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ad status');
    }
  };

  const deleteAd = async (ad: Advertisement) => {
    if (!window.confirm(`Delete advertisement "${ad.title}"?`)) return;
    setError('');
    try {
      if (isVerifiedCloudAdmin && cloudAds.some((c) => c.id === ad.id)) {
        await deleteAdFromFirestore(ad.id);
        setCloudAds(await fetchAllAdsFromFirestore());
      }
      if (ads.some((a) => a.id === ad.id)) {
        await fetch(`/api/admin/ads/${ad.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (editingId === ad.id) resetForm();
      setNotice('Advertisement deleted.');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete advertisement');
    }
  };

  return (
    <div className="space-y-6">
      {/* Persistent Cloud Storage Status Banner */}
      <div
        className={`rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3 ${
          isVerifiedCloudAdmin
            ? 'bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 border-[#00652E]/30'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
        }`}
      >
        <div className="flex items-start gap-3">
          {isVerifiedCloudAdmin ? (
            <Cloud className="w-5 h-5 text-[#00652E] dark:text-[#4ade80] shrink-0 mt-0.5" />
          ) : (
            <CloudOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="text-xs space-y-0.5">
            {isVerifiedCloudAdmin ? (
              <>
                <div className="font-bold text-[#00451F] dark:text-[#EAF5E5]">
                  Permanent Cloud Persistence Active ({firebaseUser?.email})
                </div>
                <div className="text-neutral-700 dark:text-neutral-300">
                  {cloudStatusMsg ||
                    'Your advertisements are stored in Cloud Firestore and will stay live even after shutting down your PC or restarting the server.'}
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-amber-900 dark:text-amber-200">
                  Connect Google Cloud Sync to Prevent Ads From Disappearing After PC Restarts
                </div>
                <div className="text-amber-800 dark:text-amber-300">
                  Sign in once with <strong>{BOOTSTRAP_ADMIN_EMAIL}</strong> so your ads are backed up permanently in Cloud Firestore and auto-restored anytime the server restarts.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isVerifiedCloudAdmin ? (
            <>
              <button
                type="button"
                onClick={() => void syncWithCloud()}
                disabled={cloudSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#00652E]/40 bg-white dark:bg-neutral-900 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:bg-[#EAF5E5]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                {cloudSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                onClick={() => void signOutFirebaseAdmin()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300"
              >
                <LogOut className="w-3 h-3" /> Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnectGoogle()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold"
            >
              <Cloud className="w-3.5 h-3.5" />
              Connect Google Cloud Sync
            </button>
          )}
        </div>
      </div>

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
                Publish sponsored banners across Website pages and inside the E-Paper Broadsheet &amp; PDF editions. Active ads automatically appear everywhere if no slot-specific creative overrides them.
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
              maxLength={AD_LIMITS.titleMax}
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
              maxLength={AD_LIMITS.advertiserMax}
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
              maxLength={AD_LIMITS.ctaTextMax}
              className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1">Banner Image URL or Upload</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={AD_LIMITS.imageUrlMax}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (recommended for permanent cloud storage) or upload file"
                className="flex-1 px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer hover:border-[#00652E] whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload Banner'}</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Tip: External <code className="font-mono">https://</code> banner URLs stay visible permanently across PC restarts; local uploads apply on the active server session.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Destination Target URL</label>
            <input
              type="text"
              maxLength={AD_LIMITS.targetUrlMax}
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
              maxLength={AD_LIMITS.descriptionMax}
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
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
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
          <h3 className="text-sm font-bold">Configured Advertisements ({displayedAds.length})</h3>
          <span className="text-xs text-neutral-500">
            Active ads appear automatically across Website pages and inside E-Paper editions
          </span>
        </div>

        {displayedAds.length === 0 ? (
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
              {displayedAds.map((ad) => {
                const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
                const inCloud = cloudAds.some((c) => c.id === ad.id);
                return (
                  <tr key={ad.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="p-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        {ad.image_url && (
                          <img
                            src={ad.image_url}
                            alt={ad.title}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
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
                            {inCloud ? ' · Cloud Synced' : ''}
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
                        onClick={() => void toggleActive(ad)}
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
                        onClick={() => void deleteAd(ad)}
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
