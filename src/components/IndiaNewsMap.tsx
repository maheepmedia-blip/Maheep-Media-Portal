import { ArrowRight, BookmarkCheck, BookmarkPlus, Globe2, LayoutGrid, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article, CityItem, StateItem } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';
import { IndiaCityDispatchMap } from './IndiaGoogleNewsMap.tsx';

interface IndiaNewsMapProps {
  states: StateItem[];
  selectedSlug?: string;
}

const REGION_GROUPS: Array<{ name: string; codes: string[] }> = [
  { name: 'North & Himalayan', codes: ['JK', 'LA', 'HP', 'PB', 'CH', 'UK', 'HR', 'DL', 'UP'] },
  { name: 'West & Central', codes: ['RJ', 'GJ', 'MP', 'CG', 'MH', 'GA', 'DN'] },
  { name: 'East', codes: ['BR', 'JH', 'WB', 'OD'] },
  { name: 'North-East', codes: ['SK', 'AS', 'AR', 'NL', 'MN', 'MZ', 'TR', 'ML'] },
  { name: 'South & Islands', codes: ['TS', 'AP', 'KA', 'KL', 'TN', 'PY', 'LD', 'AN'] },
];

export function IndiaNewsMap({ states, selectedSlug }: IndiaNewsMapProps) {
  const { readerToken, setReaderDrawerOpen } = usePortal();
  const [spotlightSlug, setSpotlightSlug] = useState<string>(selectedSlug || 'uttar-pradesh');
  const [spotlightArticles, setSpotlightArticles] = useState<Article[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [mapMode, setMapMode] = useState<'google' | 'grid'>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'google' : 'grid',
  );
  const [loading, setLoading] = useState(false);
  const [followedStates, setFollowedStates] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/cities?limit=400')
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((json) => setCities(json.cities || []))
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    if (selectedSlug) setSpotlightSlug(selectedSlug);
  }, [selectedSlug]);

  useEffect(() => {
    if (!spotlightSlug) return;
    setLoading(true);
    fetch(`/api/articles?state=${encodeURIComponent(spotlightSlug)}&limit=3`)
      .then((r) => r.json())
      .then((json) => setSpotlightArticles(json.articles || []))
      .catch(() => setSpotlightArticles([]))
      .finally(() => setLoading(false));
  }, [spotlightSlug]);

  useEffect(() => {
    if (!readerToken) {
      setFollowedStates([]);
      return;
    }
    fetch('/api/reader/follows', { headers: { Authorization: `Bearer ${readerToken}` } })
      .then((r) => (r.ok ? r.json() : { follows: [] }))
      .then((json) => {
        const slugs = (json.follows || [])
          .filter((f: { follow_type: string }) => f.follow_type === 'state')
          .map((f: { target_slug: string }) => f.target_slug);
        setFollowedStates(slugs);
      })
      .catch(() => {});
  }, [readerToken]);

  const activeState = states.find((s) => s.slug === spotlightSlug) || states[0];
  const isFollowed = activeState ? followedStates.includes(activeState.slug) : false;

  const toggleFollowState = async () => {
    if (!activeState) return;
    if (!readerToken) {
      setReaderDrawerOpen(true);
      return;
    }
    if (isFollowed) {
      const res = await fetch(`/api/reader/follows/state/${encodeURIComponent(activeState.slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.ok) setFollowedStates((prev) => prev.filter((s) => s !== activeState.slug));
    } else {
      const res = await fetch('/api/reader/follows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${readerToken}`,
        },
        body: JSON.stringify({
          follow_type: 'state',
          target_slug: activeState.slug,
          target_label: activeState.name,
        }),
      });
      if (res.ok) setFollowedStates((prev) => [...prev, activeState.slug]);
    }
  };

  if (states.length === 0) return null;

  return (
    <section className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 sm:p-6 bg-white dark:bg-neutral-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
            <MapPin className="w-4 h-4" />
            <span>Interactive India News Map · 28 States &amp; 8 Union Territories</span>
          </div>
          <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white mt-0.5">
            Regional Coverage Explorer
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-950 text-xs">
            <button
              type="button"
              onClick={() => setMapMode('google')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold whitespace-nowrap ${
                mapMode === 'google' ? 'bg-[#00652E] text-white' : 'text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" /> Google Map
            </button>
            <button
              type="button"
              onClick={() => setMapMode('grid')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold whitespace-nowrap ${
                mapMode === 'grid' ? 'bg-[#00652E] text-white' : 'text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Regional Grid
            </button>
          </div>
          <Link
            to="/states"
            className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
          >
            Open Full States Directory →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Google Map or Regional Cartogram Grid */}
        <div className="lg:col-span-7 space-y-4">
          {mapMode === 'google' ? (
            <div className="space-y-2">
              <IndiaCityDispatchMap
                cities={cities}
                selectedStateSlug={selectedSlug || spotlightSlug}
                onSelectStateSlug={(stSlug) => setSpotlightSlug(stSlug)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>Green pins: State capitals · Red pin: Selected city · Click any pin for Our Pride reports</span>
                {selectedSlug && (
                  <Link to="/states" className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
                    Reset to All-India View
                  </Link>
                )}
              </div>
            </div>
          ) : (
            REGION_GROUPS.map((group) => {
              const regionItems = group.codes
                .map((code) => states.find((s) => s.code === code))
                .filter((s): s is StateItem => Boolean(s));
              if (regionItems.length === 0) return null;

              return (
                <div key={group.name} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {group.name}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
                    {regionItems.map((st) => {
                      const selected = activeState?.slug === st.slug;
                      const count = st.article_count ?? 0;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setSpotlightSlug(st.slug)}
                          title={`${st.name} (${count} stories)`}
                          className={`p-2 rounded border text-left transition-colors ${
                            selected
                              ? 'bg-[#00652E] border-[#00652E] text-white'
                              : count > 0
                              ? 'bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 border-[#00652E]/25 hover:border-[#00652E] text-neutral-900 dark:text-neutral-100'
                              : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/50 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tabular">
                            <span className="font-bold">{st.code}</span>
                            <span className={selected ? 'text-white/90' : 'text-[#00652E] dark:text-[#4ade80] font-semibold'}>
                              {count}
                            </span>
                          </div>
                          <div className="text-[11px] font-medium truncate mt-0.5">{st.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Active State Spotlight */}
        {activeState && (
          <div className="lg:col-span-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[#EAF5E5]/35 dark:bg-neutral-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="text-xs font-mono-tabular text-neutral-500">
                  {activeState.code} · {activeState.type === 'ut' ? 'Union Territory' : 'State'} · {activeState.article_count ?? 0} Reports
                </div>
                <h3 className="font-editorial text-xl font-bold text-neutral-950 dark:text-white mt-0.5">
                  {activeState.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={toggleFollowState}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors whitespace-nowrap ${
                  isFollowed
                    ? 'bg-[#00652E] text-white border-[#00652E]'
                    : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]'
                }`}
              >
                {isFollowed ? <BookmarkCheck className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                {isFollowed ? 'Following' : 'Follow State'}
              </button>
            </div>

            {loading ? (
              <p className="text-xs text-neutral-500 py-4">Loading headlines from {activeState.name}...</p>
            ) : spotlightArticles.length === 0 ? (
              <div className="py-4 text-xs text-neutral-600 dark:text-neutral-400">
                No regional stories filed under {activeState.name} yet. Select another state tile or explore all Indian dispatches.
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {spotlightArticles.map((art) => (
                  <div key={art.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      to={`/news/${art.slug}`}
                      className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-[#00652E] dark:hover:text-[#4ade80] leading-snug block"
                    >
                      {art.title}
                    </Link>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2">{art.summary}</p>
                    <div className="text-[11px] text-neutral-500 mt-1 font-mono-tabular">
                      {art.category_name} · {formatIndiaDate(art.published_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <Link
                to={`/states/${activeState.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
              >
                Open {activeState.name} Regional Edition <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
