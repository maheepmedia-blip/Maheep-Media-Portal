import { useEffect, useState } from 'react';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article } from '../types/news.ts';

const NATIONAL_TOPICS = [
  'All',
  'Parliament & Policy',
  'Defence',
  'Courts & Legal',
  'Infrastructure',
  'Economy',
];

export function NationalPage() {
  const { language } = usePortal();
  const [topic, setTopic] = useState('All');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ category: 'national', limit: '30' });
    if (language !== 'all') params.set('language', language);
    if (topic !== 'All') params.set('subtopic', topic.split(' ')[0]);

    fetch(`/api/articles?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setArticles(json.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language, topic]);

  return (
    <PublicLayout>
      <SeoHead
        title="National News — Maheep News Portal | Parliament, Policy, Defence & Courts"
        description="Coverage of Indian Parliament, public policy, governance, defence, infrastructure, and Supreme Court legal developments."
        canonicalPath="/national"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">राष्ट्रीय समाचार · National Desk</p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
            National Affairs, Parliament &amp; Governance
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
            In-depth reporting on central legislation, Cabinet decisions, defence preparedness, national infrastructure corridors, and judicial directives.
          </p>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {NATIONAL_TOPICS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTopic(item)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  topic === item
                    ? 'bg-[#00652E] text-white'
                    : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-[#EAF5E5] dark:hover:bg-neutral-800'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading national dispatches...</div>
        ) : articles.length === 0 ? (
          <div className="py-12 text-center border border-neutral-200 dark:border-neutral-800 rounded-lg mt-8">
            <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">
              No national stories matched "{topic}".
            </p>
            <button
              type="button"
              onClick={() => setTopic('All')}
              className="mt-3 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
            >
              Show All National Stories
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((art) => (
              <NewsCard key={art.id} article={art} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
