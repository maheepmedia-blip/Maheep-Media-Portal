import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BOOTSTRAP_ADMIN_EMAIL, OperationType, auth, db, handleFirestoreError } from '../firebase.ts';
import type { AdPlacement, Advertisement } from '../types/news.ts';

// Constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const AD_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const AD_DATE_REGEX = /^(|\d{4}-\d{2}-\d{2})$/;
export const VALID_AD_PLACEMENTS: readonly AdPlacement[] = [
  'all_slots',
  'header_banner',
  'homepage_mid',
  'sidebar',
  'article_inline',
  'epaper_banner',
];
export const VALID_AD_LANGUAGES = ['all', 'en', 'hi'] as const;

export const AD_LIMITS = {
  idMax: 128,
  titleMax: 200,
  advertiserMax: 120,
  imageUrlMax: 2048,
  targetUrlMax: 2048,
  descriptionMax: 400,
  ctaTextMax: 60,
  dateMax: 20,
} as const;

function getTodayIstDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function normalizePlacement(val: unknown): AdPlacement {
  const s = String(val || 'all_slots').trim() as AdPlacement;
  return (VALID_AD_PLACEMENTS as readonly string[]).includes(s) ? s : 'all_slots';
}

function normalizeLanguage(val: unknown): 'all' | 'en' | 'hi' {
  return val === 'en' || val === 'hi' ? val : 'all';
}

function sanitizeHttpOrPathUrl(val: unknown, allowRelative: boolean): string {
  const s = String(val || '').trim();
  if (!s) return '';
  if (allowRelative && s.startsWith('/')) {
    return s.slice(0, AD_LIMITS.targetUrlMax);
  }
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString().slice(0, AD_LIMITS.imageUrlMax);
    }
  } catch {
    return '';
  }
  return '';
}

function mapFirestoreDocToAd(docId: string, data: Record<string, unknown>): Advertisement {
  return {
    id: String(data.id || docId).slice(0, AD_LIMITS.idMax),
    title: String(data.title || '').slice(0, AD_LIMITS.titleMax),
    advertiser: String(data.advertiser || '').slice(0, AD_LIMITS.advertiserMax),
    placement: normalizePlacement(data.placement),
    image_url: String(data.image_url || '').slice(0, AD_LIMITS.imageUrlMax),
    target_url: String(data.target_url || '').slice(0, AD_LIMITS.targetUrlMax),
    description: String(data.description || '').slice(0, AD_LIMITS.descriptionMax),
    cta_text: String(data.cta_text || 'Learn More').slice(0, AD_LIMITS.ctaTextMax) || 'Learn More',
    language: normalizeLanguage(data.language),
    active: Boolean(data.active),
    start_date: String(data.start_date || '').slice(0, AD_LIMITS.dateMax),
    end_date: String(data.end_date || '').slice(0, AD_LIMITS.dateMax),
    impressions: Math.max(0, Math.floor(Number(data.impressions || 0) || 0)),
    clicks: Math.max(0, Math.floor(Number(data.clicks || 0) || 0)),
    created_at: toIsoString(data.createdAt),
    updated_at: toIsoString(data.updatedAt),
  };
}

export function isVerifiedFirestoreAdminUser(): boolean {
  const u = auth.currentUser;
  return Boolean(u && u.emailVerified && u.email === BOOTSTRAP_ADMIN_EMAIL);
}

export function sanitizeAdDraft(input: {
  id?: string;
  title: string;
  advertiser?: string;
  placement: AdPlacement;
  image_url?: string;
  target_url?: string;
  description?: string;
  cta_text?: string;
  language?: 'all' | 'en' | 'hi';
  active?: boolean | number;
  start_date?: string;
  end_date?: string;
  impressions?: number;
  clicks?: number;
}) {
  const rawId = String(input.id || '').trim();
  const safeId =
    rawId && AD_ID_REGEX.test(rawId) && rawId.length >= 3 && rawId.length <= AD_LIMITS.idMax
      ? rawId
      : `ad-${crypto.randomUUID().slice(0, 10)}`;

  const title = String(input.title || '').trim().slice(0, AD_LIMITS.titleMax);
  const startRaw = String(input.start_date || '').trim().slice(0, AD_LIMITS.dateMax);
  const endRaw = String(input.end_date || '').trim().slice(0, AD_LIMITS.dateMax);

  return {
    id: safeId,
    title,
    advertiser: String(input.advertiser || '').trim().slice(0, AD_LIMITS.advertiserMax),
    placement: normalizePlacement(input.placement),
    image_url: sanitizeHttpOrPathUrl(input.image_url, true).slice(0, AD_LIMITS.imageUrlMax),
    target_url: sanitizeHttpOrPathUrl(input.target_url, true).slice(0, AD_LIMITS.targetUrlMax),
    description: String(input.description || '').trim().slice(0, AD_LIMITS.descriptionMax),
    cta_text: (String(input.cta_text || 'Learn More').trim() || 'Learn More').slice(0, AD_LIMITS.ctaTextMax),
    language: normalizeLanguage(input.language),
    active: Boolean(input.active ?? true),
    start_date: AD_DATE_REGEX.test(startRaw) ? startRaw : '',
    end_date: AD_DATE_REGEX.test(endRaw) ? endRaw : '',
    impressions: Math.max(0, Math.floor(Number(input.impressions || 0) || 0)),
    clicks: Math.max(0, Math.floor(Number(input.clicks || 0) || 0)),
  };
}

export async function fetchActiveAdsFromFirestore(): Promise<Advertisement[]> {
  try {
    const q = query(collection(db, 'ads'), where('active', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapFirestoreDocToAd(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'ads');
  }
}

export async function fetchActiveAdsMerged(options: {
  placement?: AdPlacement;
  lang?: 'all' | 'en' | 'hi';
  allowFallback?: boolean;
}): Promise<Advertisement[]> {
  const { placement, lang, allowFallback = true } = options;
  const qs = new URLSearchParams();
  if (placement) qs.set('placement', placement);
  if (lang === 'en' || lang === 'hi') qs.set('lang', lang);
  if (!allowFallback) qs.set('fallback', '0');

  const [cloudResult, apiResult] = await Promise.allSettled([
    fetchActiveAdsFromFirestore(),
    fetch(`/api/ads?${qs.toString()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { ads: [] })),
  ]);

  const byId = new Map<string, Advertisement>();

  if (apiResult.status === 'fulfilled' && Array.isArray(apiResult.value?.ads)) {
    for (const ad of apiResult.value.ads as Advertisement[]) {
      if (ad?.id) byId.set(ad.id, ad);
    }
  }

  if (cloudResult.status === 'fulfilled') {
    for (const ad of cloudResult.value) {
      if (ad?.id) byId.set(ad.id, ad);
    }
  }

  const todayIst = getTodayIstDate();
  const eligible = Array.from(byId.values()).filter((ad) => {
    if (!ad.active) return false;
    if (ad.start_date && ad.start_date > todayIst) return false;
    if (ad.end_date && ad.end_date < todayIst) return false;
    if (lang && lang !== 'all' && ad.language !== 'all' && ad.language !== lang) return false;
    return true;
  });

  if (!placement) {
    return eligible.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const slotMatches = eligible
    .filter((ad) => ad.placement === placement || ad.placement === 'all_slots')
    .sort((a, b) => {
      const aExact = a.placement === placement ? 0 : 1;
      const bExact = b.placement === placement ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.created_at < b.created_at ? 1 : -1;
    });

  if (slotMatches.length > 0 || !allowFallback) {
    return slotMatches;
  }

  return eligible.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function fetchAllAdsFromFirestore(): Promise<Advertisement[]> {
  try {
    const snap = await getDocs(collection(db, 'ads'));
    return snap.docs
      .map((d) => mapFirestoreDocToAd(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'ads');
  }
}

export async function createAdInFirestore(
  input: Parameters<typeof sanitizeAdDraft>[0],
): Promise<Advertisement> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with Google to save ads to Cloud Firestore.');

  const clean = sanitizeAdDraft(input);
  if (!clean.title) throw new Error('Advertisement headline title is required.');

  const docPath = `ads/${clean.id}`;
  try {
    await setDoc(doc(db, 'ads', clean.id), {
      ...clean,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }

  const now = new Date().toISOString();
  return { ...clean, created_at: now, updated_at: now };
}

export async function updateAdInFirestore(
  id: string,
  patch: Partial<Parameters<typeof sanitizeAdDraft>[0]>,
  existingAd: Advertisement,
): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in with Google to update ads in Cloud Firestore.');
  const clean = sanitizeAdDraft({
    id,
    title: patch.title ?? existingAd.title,
    advertiser: patch.advertiser ?? existingAd.advertiser,
    placement: patch.placement ?? existingAd.placement,
    image_url: patch.image_url ?? existingAd.image_url,
    target_url: patch.target_url ?? existingAd.target_url,
    description: patch.description ?? existingAd.description,
    cta_text: patch.cta_text ?? existingAd.cta_text,
    language: patch.language ?? existingAd.language,
    active: patch.active ?? existingAd.active,
    start_date: patch.start_date ?? existingAd.start_date,
    end_date: patch.end_date ?? existingAd.end_date,
    impressions: patch.impressions ?? existingAd.impressions,
    clicks: patch.clicks ?? existingAd.clicks,
  });

  if (!clean.title) throw new Error('Advertisement headline title cannot be empty.');

  const docPath = `ads/${id}`;
  try {
    await updateDoc(doc(db, 'ads', id), {
      title: clean.title,
      advertiser: clean.advertiser,
      placement: clean.placement,
      image_url: clean.image_url,
      target_url: clean.target_url,
      description: clean.description,
      cta_text: clean.cta_text,
      language: clean.language,
      active: clean.active,
      start_date: clean.start_date,
      end_date: clean.end_date,
      impressions: clean.impressions,
      clicks: clean.clicks,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteAdFromFirestore(id: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in with Google to delete ads from Cloud Firestore.');
  const docPath = `ads/${id}`;
  try {
    await deleteDoc(doc(db, 'ads', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
