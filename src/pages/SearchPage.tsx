import { Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import type { Article, Category, StateItem } from '../types/news.ts';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [stateSlug, setStateSlug] = useState(searchParams.get('state') || 'all');
  const [language, setLanguage] = useState(searchParams.get('language') || 'all');
  const [date, setDate] = useState(searchParams.get('date') || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/categories').then((r) => r.json()).then((j) => setCategories(j.categories || [])).catch(() => {});
    fetch('/api/states').then((r) => r.json()).then((j) => setStates(j.states || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '30' });
    if (q.trim()) params.set('q', q.trim());
    if (category !== 'all') params.set('category', category);
    if (stateSlug !== 'all') params.set('state', stateSlug);
    if (language !== 'all') params.set('language', language);
    if (date) params.set('date', date);

    fetch(`/api/articles?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        setArticles(json.articles || []);
        setTotal(json.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, category, stateSlug, language, date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (category !== 'all') next.set('category', category);
    if (stateSlug !== 'all') next.set('state', stateSlug);
    if (language !== 'all') next.set('language', language);
    if (date) next.set('date', date);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setQ('');
    setCategory('all');
    setStateSlug('all');
    setLanguage('all');
    setDate('');
    setSearchParams({});
  };

  return (
    <PublicLayout>
      <SeoHead
        title="Search News Archive — Maheep News Portal"
        description="Search Maheep News Portal across all categories, 28 Indian states, 8 Union Territories, Hindi and English editions, and dates."
        canonicalPath="/search"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <h1 className="font-editorial text-3xl font-bold text-neutral-950 dark:text-white">
            Search &amp; News Archive
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Filter stories by keyword, category, Indian state/UT, language, or publication date.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Keywords, headlines, topics..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>

            <select
              value={stateSlug}
              onChange={(e) => setStateSlug(e.target.value)}
              aria-label="Filter by state"
              className="px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            >
              <option value="all">All States &amp; UTs</option>
              {states.map((s) => (
                <option key={s.id} value={s.slug}>{s.name}</option>
              ))}
            </select>

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Filter by language"
              className="px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            >
              <option value="all">Hindi &amp; English</option>
              <option value="en">English Only</option>
              <option value="hi">हिन्दी Only</option>
            </select>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Filter by date"
              className="px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
            <span className="font-mono-tabular">{total} matching stories</span>
            <div className="flex items-center gap-3">
              <span>Quick topics:</span>
              {['Parliament', 'RBI', 'ISRO', 'Solar', 'Cricket'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setQ(tag)}
                  className="text-[#00652E] dark:text-[#4ade80] hover:underline font-medium"
                >
                  {tag}
                </button>
              ))}
              <button type="button" onClick={resetFilters} className="text-neutral-600 dark:text-neutral-300 underline">
                Clear all
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Searching archive...</p>
        ) : articles.length === 0 ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
            <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">
              No articles matched your search filters.
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Try broadening your keywords, removing the date filter, or switching language to All.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
            >
              Reset Search Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((art) => (
              <NewsCard key={art.id} article={art} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
