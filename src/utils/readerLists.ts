export interface SavedArticleEntry {
  slug: string;
  title: string;
  category_name?: string;
  published_at?: string;
  image_url?: string;
  savedAt: string;
}

export interface SavedEpaperPageEntry {
  edition_date: string;
  page_number: number;
  section_title: string;
  savedAt: string;
}

export interface RecentHistoryEntry {
  slug: string;
  title: string;
  category_name?: string;
  readAt: string;
}

const SAVED_ARTICLES_KEY = 'maheep_free_saved_articles_v1';
const SAVED_EPAPER_KEY = 'maheep_free_saved_epaper_v1';
const RECENT_HISTORY_KEY = 'maheep_free_history_v1';
export const READER_LISTS_EVENT = 'maheep-reader-lists-changed';

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(READER_LISTS_EVENT));
  }
}

export function getSavedArticles(): SavedArticleEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_ARTICLES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isArticleSavedLocally(slug: string): boolean {
  return getSavedArticles().some((a) => a.slug === slug);
}

export function toggleSavedArticleLocally(entry: Omit<SavedArticleEntry, 'savedAt'>): boolean {
  const list = getSavedArticles();
  const exists = list.some((a) => a.slug === entry.slug);
  const next = exists
    ? list.filter((a) => a.slug !== entry.slug)
    : [{ ...entry, savedAt: new Date().toISOString() }, ...list].slice(0, 50);
  try {
    localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota error
  }
  emitChange();
  return !exists;
}

export function getSavedEpaperPages(): SavedEpaperPageEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_EPAPER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isEpaperPageSavedLocally(editionDate: string, pageNumber: number): boolean {
  return getSavedEpaperPages().some((p) => p.edition_date === editionDate && p.page_number === pageNumber);
}

export function toggleSavedEpaperPageLocally(entry: Omit<SavedEpaperPageEntry, 'savedAt'>): boolean {
  const list = getSavedEpaperPages();
  const exists = list.some(
    (p) => p.edition_date === entry.edition_date && p.page_number === entry.page_number,
  );
  const next = exists
    ? list.filter((p) => !(p.edition_date === entry.edition_date && p.page_number === entry.page_number))
    : [{ ...entry, savedAt: new Date().toISOString() }, ...list].slice(0, 40);
  try {
    localStorage.setItem(SAVED_EPAPER_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota error
  }
  emitChange();
  return !exists;
}

export function getRecentHistory(): RecentHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordArticleReadLocally(entry: Omit<RecentHistoryEntry, 'readAt'>): void {
  if (typeof window === 'undefined' || !entry.slug) return;
  const list = getRecentHistory().filter((r) => r.slug !== entry.slug);
  const next = [{ ...entry, readAt: new Date().toISOString() }, ...list].slice(0, 15);
  try {
    localStorage.setItem(RECENT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota error
  }
  emitChange();
}

export function clearLocalReadingHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_HISTORY_KEY);
  } catch {
    // Ignore error
  }
  emitChange();
}
