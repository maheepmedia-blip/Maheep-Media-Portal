import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article } from '../types/news.ts';

const BUSINESS_TOPICS = ['All', 'Economy', 'Markets', 'Banking', 'Startups', 'Personal Finance'];
const SPORTS_TOPICS = ['All', 'Cricket', 'Football', 'Hockey', 'Badminton', 'Tennis', 'Athletics'];

export function BusinessSportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = usePortal();
  const initialTab = searchParams.get('tab') === 'sports' ? 'sports' : 'business';
  const [activeTab, setActiveTab] = useState<'business' | 'sports'>(initialTab);
  const [subtopic, setSubtopic] = useState('All');
  const [businessArticles, setBusinessArticles] = useState<Article[]>([]);
  const [sportsArticles, setSportsArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab') === 'sports' ? 'sports' : 'business';
    setActiveTab(tabParam);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const langParam = language !== 'all' ? `&language=${language}` : '';
    const subParam = subtopic !== 'All' ? `&subtopic=${encodeURIComponent(subtopic)}` : '';

    Promise.all([
      fetch(`/api/articles?category=business&limit=18${langParam}${activeTab === 'business' ? subParam : ''}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/articles?category=sports&limit=18${langParam}${activeTab === 'sports' ? subParam : ''}`).then((r) =>
        r.json(),
      ),
    ])
      .then(([biz, spr]) => {
        setBusinessArticles(biz.articles || []);
        setSportsArticles(spr.articles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language, activeTab, subtopic]);

  const switchTab = (tab: 'business' | 'sports') => {
    setActiveTab(tab);
    setSubtopic('All');
    setSearchParams(tab === 'sports' ? { tab: 'sports' } : {});
  };

  const currentList = activeTab === 'business' ? businessArticles : sportsArticles;
  const topics = activeTab === 'business' ? BUSINESS_TOPICS : SPORTS_TOPICS;

  return (
    <PublicLayout>
      <SeoHead
        title="Business & Sports — Maheep News Portal | Indian Economy, Markets & Cricket"
        description="Coverage of Indian economy, markets, banking, startups, personal finance education, cricket, hockey, football, badminton, and tennis."
        canonicalPath="/business-sports"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">व्यापार और खेल · Business &amp; Sports</p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
            Economy, Markets &amp; Indian Sports
          </h1>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1">
              <button
                type="button"
                onClick={() => switchTab('business')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeTab === 'business'
                    ? 'bg-[#00652E] text-white'
                    : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950'
                }`}
              >
                Business &amp; Economy
              </button>
              <button
                type="button"
                onClick={() => switchTab('sports')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeTab === 'sports'
                    ? 'bg-[#00652E] text-white'
                    : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950'
                }`}
              >
                Sports &amp; Athletics
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSubtopic(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    subtopic === t
                      ? 'bg-[#EAF5E5] text-[#00451F] border border-[#00652E]/30 dark:bg-[#00451F] dark:text-white'
                      : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <AdSlot placement="header_banner" />
        </div>

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading {activeTab} coverage...</div>
        ) : currentList.length === 0 ? (
          <div className="mt-8 p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
            <p className="text-base font-medium">No articles found for "{subtopic}".</p>
            <button
              type="button"
              onClick={() => setSubtopic('All')}
              className="mt-3 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
            >
              Reset Subtopic Filter
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentList.map((art) => (
              <NewsCard key={art.id} article={art} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
