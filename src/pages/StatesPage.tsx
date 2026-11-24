import { MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { IndiaNewsMap } from '../components/IndiaNewsMap.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article, Category, StateItem } from '../types/news.ts';

export function StatesPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { language } = usePortal();
  const [states, setStates] = useState<StateItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'state' | 'ut'>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/states')
      .then((r) => r.json())
      .then((json) => setStates(json.states || []))
      .catch(() => {});

    fetch('/api/categories')
      .then((r) => r.json())
      .then((json) => setCategories(json.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '36' });
    if (slug) params.set('state', slug);
    else params.set('state', 'any');
    if (catFilter !== 'all') params.set('category', catFilter);
    if (language !== 'all') params.set('language', language);

    fetch(`/api/articles?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setArticles(json.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, catFilter, language]);

  const activeState = states.find((s) => s.slug === slug);
  const filteredStates = states.filter((s) => {
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    const matchesSearch =
      !searchTerm.trim() ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const stateCount = states.filter((s) => s.type === 'state').length;
  const utCount = states.filter((s) => s.type === 'ut').length;

  return (
    <PublicLayout>
      <SeoHead
        title={
          activeState
            ? `${activeState.name} News — Maheep News Portal`
            : 'States & Union Territories News — All 28 States & 8 UTs | Maheep News Portal'
        }
        description="Complete regional journalism covering all 28 Indian States and 8 Union Territories with dynamic news counts and category filtering."
        canonicalPath={slug ? `/states/${slug}` : '/states'}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Header */}
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
              राज्य एवं केंद्र शासित प्रदेश · {stateCount} States &amp; {utCount} Union Territories
            </p>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
              {activeState ? `${activeState.name} News Edition` : 'India States & Union Territories'}
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {activeState
                ? `Regional dispatches, civic updates, and policy coverage from ${activeState.name} (${activeState.code}).`
                : 'Select any state or Union Territory to read regional stories, civic governance updates, and local developments.'}
            </p>
          </div>

          {activeState && (
            <Link
              to="/states"
              className="inline-flex items-center px-4 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] whitespace-nowrap self-start lg:self-auto"
            >
              View All 36 States &amp; UTs
            </Link>
          )}
        </div>

        {/* Interactive India News Map & State Spotlight */}
        <IndiaNewsMap states={states} selectedSlug={slug} />

        <AdSlot placement="homepage_mid" />

        {/* Search & Filter Directory */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1 self-start">
              {([
                ['all', `All (${states.length})`],
                ['state', `28 States`],
                ['ut', `8 Union Territories`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    typeFilter === key
                      ? 'bg-white dark:bg-neutral-800 text-[#00652E] dark:text-[#4ade80] shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search state or code (e.g. UP, Bihar, Delhi)..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:border-[#00652E]"
              />
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {filteredStates.map((st) => {
              const isSelected = st.slug === slug;
              return (
                <Link
                  key={st.id}
                  to={`/states/${st.slug}`}
                  className={`p-3 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#EAF5E5] dark:bg-[#00451F]/40 border-[#00652E] text-[#00451F] dark:text-white'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono-tabular text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {st.code} · {st.type === 'ut' ? 'UT' : 'State'}
                    </span>
                    <span className="font-mono-tabular text-xs font-bold text-[#00652E] dark:text-[#4ade80]">
                      {st.article_count ?? 0}
                    </span>
                  </div>
                  <span className="mt-1.5 text-xs sm:text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
                    {st.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* State News Feed & Category Filter */}
        <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#00652E]" />
              <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                {activeState ? `Latest from ${activeState.name}` : 'Latest Regional Dispatches'}
              </h2>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCatFilter('all')}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  catFilter === 'all' ? 'bg-[#00652E] text-white' : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                All Categories
              </button>
              {categories.slice(0, 6).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCatFilter(cat.slug)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                    catFilter === cat.slug
                      ? 'bg-[#00652E] text-white'
                      : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-500">Loading regional dispatches...</p>
          ) : articles.length === 0 ? (
            <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
              <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">
                No published dispatches yet for {activeState ? activeState.name : 'this filter'}.
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Our regional desk and automated RSS feeds continuously update state coverage.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((art) => (
                <NewsCard key={art.id} article={art} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
