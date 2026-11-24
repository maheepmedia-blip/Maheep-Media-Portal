import { Calendar, Clock, Edit3 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Article } from '../../types/news.ts';
import { formatIndiaDateTime } from '../../utils/date.ts';

interface CalendarItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  language: string;
  published_at: string | null;
  scheduled_at: string | null;
  unpublish_at: string | null;
  featured: number;
  breaking: number;
  category_name: string;
}

export function AdminCalendarPanel({
  token,
  onEditArticle,
}: {
  token: string;
  onEditArticle: (article: Partial<Article>) => void;
}) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/calendar', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setItems(json.items || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const scheduled = items.filter((i) => Boolean(i.scheduled_at) && i.status !== 'published');
  const expiring = items.filter((i) => Boolean(i.unpublish_at) && i.status === 'published');
  const published = items.filter((i) => i.status === 'published');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#00652E]" />
            <h2 className="text-base font-bold">Upcoming Scheduled Releases ({scheduled.length})</h2>
          </div>
          {loading ? (
            <p className="text-xs text-neutral-500">Loading schedule...</p>
          ) : scheduled.length === 0 ? (
            <p className="text-xs text-neutral-500">No stories scheduled for future publication.</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {scheduled.map((item) => (
                <div key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="text-[#00652E] font-mono-tabular mt-0.5">
                      Scheduled: {formatIndiaDateTime(item.scheduled_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditArticle({ id: item.id })}
                    className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300 hover:underline shrink-0"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-600" />
            <h2 className="text-base font-bold">Scheduled Auto-Unpublish ({expiring.length})</h2>
          </div>
          {expiring.length === 0 ? (
            <p className="text-xs text-neutral-500">No published stories configured for automatic expiry.</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {expiring.map((item) => (
                <div key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="text-amber-600 font-mono-tabular mt-0.5">
                      Unpublishes: {formatIndiaDateTime(item.unpublish_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditArticle({ id: item.id })}
                    className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300 hover:underline shrink-0"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
        <h2 className="text-base font-bold mb-3">Recent 14-Day Publication Timeline (IST)</h2>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-96 overflow-y-auto">
          {published.map((item) => (
            <div key={item.id} className="py-2 flex items-center justify-between gap-3">
              <div className="truncate">
                <span className="font-mono-tabular text-neutral-500 mr-2">{formatIndiaDateTime(item.published_at)}</span>
                <span className="font-semibold">{item.title}</span>
              </div>
              <span className="text-neutral-500 shrink-0">{item.category_name || 'News'} · {item.language.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
