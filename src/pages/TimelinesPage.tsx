import { BarChart2, Clock, ExternalLink, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdSlot } from '../components/AdSlot.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import type { ElectionUpdate, TimelineItem } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';

interface SeatRow {
  party: string;
  seats: number;
  color?: string;
}

export function TimelinesPage() {
  const [timelines, setTimelines] = useState<TimelineItem[]>([]);
  const [elections, setElections] = useState<ElectionUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/timelines').then((r) => r.json()),
      fetch('/api/elections').then((r) => r.json()),
    ])
      .then(([tlJson, elJson]) => {
        setTimelines(tlJson.timelines || []);
        setElections(elJson.updates || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PublicLayout>
      <SeoHead
        title="News Timelines & Public Data — Maheep News Portal"
        description="Chronological News Timelines following major Indian policy and technology stories alongside sourced Election and Parliamentary reference dashboards."
        canonicalPath="/timelines"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        <header className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
            घटनाक्रम एवं सार्वजनिक डेटा डेस्क · Verified Chronologies
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
            News Timelines &amp; Public Data Desk
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Follow multi-stage national developments from inception to recent updates, with primary source attribution.
          </p>
        </header>

        <AdSlot placement="header_banner" />

        {loading ? (
          <div className="text-sm text-neutral-500">Loading timelines and public records...</div>
        ) : (
          <>
            {/* Chronological Story Timelines */}
            <section className="space-y-8">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#00652E] dark:text-[#4ade80]" />
                <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                  Developing News Timelines
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {timelines.map((tl) => (
                  <div
                    key={tl.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 bg-white dark:bg-neutral-900 space-y-5"
                  >
                    <div className="pb-4 border-b border-neutral-200 dark:border-neutral-800">
                      <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">{tl.topic}</div>
                      <h3 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white mt-1">
                        {tl.title}
                      </h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5">{tl.summary}</p>
                    </div>

                    <ol className="space-y-4">
                      {tl.events.map((ev, idx) => (
                        <li
                          key={ev.id}
                          className="pb-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0 last:pb-0 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono-tabular font-bold text-[#00652E] dark:text-[#4ade80]">
                              {String(idx + 1).padStart(2, '0')} · {ev.event_date}
                            </span>
                            <span className="text-neutral-500">{ev.source_name}</span>
                          </div>
                          <h4 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
                            {ev.headline}
                          </h4>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                            {ev.summary}
                          </p>
                          {ev.source_url && (
                            <a
                              href={ev.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                            >
                              Source Record <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>

            {/* Sourced Election & Public Seat Reference */}
            {elections.length > 0 && (
              <section className="pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-6">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-[#00652E] dark:text-[#4ade80]" />
                  <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                    Election &amp; Parliamentary Reference Tracker
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {elections.map((el) => {
                    let rows: SeatRow[] = [];
                    try {
                      const parsed = JSON.parse(el.data_json || '{}');
                      rows = Array.isArray(parsed.parties) ? parsed.parties : [];
                    } catch {
                      rows = [];
                    }
                    const maxSeats = Math.max(1, el.total_seats || 543);
                    return (
                      <div
                        key={el.id}
                        className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 bg-white dark:bg-neutral-900 space-y-5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-neutral-200 dark:border-neutral-800">
                          <div>
                            <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">{el.region}</div>
                            <h3 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white mt-0.5">
                              {el.title}
                            </h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{el.summary}</p>
                          </div>
                          <div className="text-xs font-mono-tabular text-neutral-500 shrink-0">
                            Declared: <strong className="text-neutral-900 dark:text-white">{el.declared_seats}</strong> / {el.total_seats}
                          </div>
                        </div>

                        <div className="space-y-3">
                          {rows.map((row) => {
                            const pct = Math.min(100, Math.round((row.seats / maxSeats) * 100));
                            return (
                              <div key={row.party} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{row.party}</span>
                                  <span className="font-mono-tabular font-bold text-neutral-800 dark:text-neutral-200">
                                    {row.seats} seats ({pct}%)
                                  </span>
                                </div>
                                <div className="w-full h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${Math.max(2, pct)}%`, backgroundColor: row.color || '#00652E' }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                          <span className="inline-flex items-center gap-1 font-mono-tabular">
                            <Clock className="w-3.5 h-3.5" /> Updated: {formatIndiaDateTime(el.updated_at)}
                          </span>
                          {el.source_url && (
                            <a
                              href={el.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                            >
                              Official Source: {el.source_name} <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
