import { Bookmark, BookOpen, Clock, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearLocalReadingHistory,
  getRecentHistory,
  getSavedArticles,
  getSavedEpaperPages,
  READER_LISTS_EVENT,
  type RecentHistoryEntry,
  type SavedArticleEntry,
  type SavedEpaperPageEntry,
  toggleSavedArticleLocally,
  toggleSavedEpaperPageLocally,
} from '../utils/readerLists.ts';

interface SavedReadingDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SavedReadingDrawer({ open, onClose }: SavedReadingDrawerProps) {
  const [savedArticles, setSavedArticles] = useState<SavedArticleEntry[]>(() => getSavedArticles());
  const [savedPages, setSavedPages] = useState<SavedEpaperPageEntry[]>(() => getSavedEpaperPages());
  const [history, setHistory] = useState<RecentHistoryEntry[]>(() => getRecentHistory());

  useEffect(() => {
    const sync = () => {
      setSavedArticles(getSavedArticles());
      setSavedPages(getSavedEpaperPages());
      setHistory(getRecentHistory());
    };
    sync();
    window.addEventListener(READER_LISTS_EVENT, sync);
    return () => window.removeEventListener(READER_LISTS_EVENT, sync);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Free Saved Reading List and Recent History"
    >
      <div
        className="w-full max-w-md h-full bg-white dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">
              Saved Reading &amp; History
            </h2>
            <p className="text-xs text-neutral-500">100% Free offline reading list · No account required</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close saved reading drawer"
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Saved E-Paper Pages */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80]">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bookmarked E-Paper Pages ({savedPages.length})</span>
            </div>
            {savedPages.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Bookmark any E-Paper page inside the Digital Broadsheet to jump straight back later.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {savedPages.map((p) => (
                  <div
                    key={`${p.edition_date}-${p.page_number}`}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <Link
                      to={`/epaper?date=${encodeURIComponent(p.edition_date)}&page=${p.page_number}`}
                      onClick={onClose}
                      className="min-w-0 hover:text-[#00652E] dark:hover:text-[#4ade80]"
                    >
                      <div className="font-semibold truncate">{p.section_title}</div>
                      <div className="text-[11px] font-mono-tabular text-neutral-500">
                        {p.edition_date} · Page {p.page_number}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleSavedEpaperPageLocally(p)}
                      aria-label="Remove saved page"
                      className="text-neutral-400 hover:text-[#DF2525] p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Saved Articles */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80]">
              <Bookmark className="w-3.5 h-3.5" />
              <span>Saved Stories ({savedArticles.length})</span>
            </div>
            {savedArticles.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Click Save on any story to keep it here for fast access without signing up.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {savedArticles.map((art) => (
                  <div key={art.slug} className="px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs">
                    <Link
                      to={`/news/${art.slug}`}
                      onClick={onClose}
                      className="min-w-0 hover:text-[#00652E] dark:hover:text-[#4ade80]"
                    >
                      <div className="font-semibold line-clamp-2">{art.title}</div>
                      {art.category_name && (
                        <div className="text-[11px] text-neutral-500 mt-0.5">{art.category_name}</div>
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleSavedArticleLocally(art)}
                      aria-label="Remove saved story"
                      className="text-neutral-400 hover:text-[#DF2525] p-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recently Read */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Recently Read ({history.length})</span>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearLocalReadingHistory}
                  className="text-[11px] text-neutral-500 hover:text-[#DF2525] underline"
                >
                  Clear History
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-neutral-500">Stories you open will appear here automatically.</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {history.map((item) => (
                  <Link
                    key={item.slug}
                    to={`/news/${item.slug}`}
                    onClick={onClose}
                    className="block px-3.5 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <div className="font-medium line-clamp-2 text-neutral-900 dark:text-neutral-100">{item.title}</div>
                    {item.category_name && (
                      <div className="text-[11px] text-neutral-500 mt-0.5">{item.category_name}</div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
