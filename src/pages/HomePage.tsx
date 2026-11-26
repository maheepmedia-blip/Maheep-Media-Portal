import { ArrowRight, BookOpen, Compass, Download, Headphones, History, MapPin, TrendingUp } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PollWidget } from '../components/PollWidget.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article, ContentGuide, Edition, GrowthConfig, StateItem } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';
import { trackGrowthEvent } from '../utils/utm.ts';

interface HomePayload {
  breaking: Article[];
  featured: Article[];
  latest: Article[];
  trending: Article[];
  sections?: {
    national: Article[];
    state: Article[];
    business: Article[];
    sports: Article[];
    technology: Article[];
    education: Article[];
  };
  states: StateItem[];
  latestEdition: Edition | null;
}

export function HomePage() {
  const { language } = usePortal();
  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterFeedback, setNewsletterFeedback] = useState('');
  const [newsletterConfirmUrl, setNewsletterConfirmUrl] = useState('');
  const [guides, setGuides] = useState<ContentGuide[]>([]);
  const [growthConfig, setGrowthConfig] = useState<GrowthConfig | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = language !== 'all' ? `?lang=${language}` : '';
    Promise.all([
      fetch(`/api/home${qs}`).then((r) => r.json()),
      fetch('/api/guides').then((r) => (r.ok ? r.json() : { guides: [] })),
      fetch('/api/growth/config').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([homeJson, guidesJson, cfgJson]) => {
        if (!active) return;
        setData(homeJson);
        setGuides(guidesJson.guides || []);
        if (cfgJson) setGrowthConfig(cfgJson);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [language]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterFeedback('');
    setNewsletterConfirmUrl('');
    const res = await fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newsletterEmail, language_pref: language }),
    });
    const json = await res.json();
    setNewsletterFeedback(json.message || json.error || '');
    if (json.confirmUrl) setNewsletterConfirmUrl(json.confirmUrl);
    if (res.ok) {
      setNewsletterEmail('');
      trackGrowthEvent('newsletter_signup', { cta_variant: 'homepage_banner', language });
    }
  };

  const leadArticle = data?.featured?.[0] || data?.latest?.[0];
  const secondaryFeatured = (data?.featured || []).slice(1, 4);
  const featuredIds = new Set([leadArticle?.id, ...secondaryFeatured.map((a) => a.id)].filter(Boolean));
  const latestFeed = (data?.latest || []).filter((a) => !featuredIds.has(a.id));

  const fallbackByCat = (slugs: string[]) =>
    latestFeed.filter((a) => slugs.includes(a.category_slug || '')).slice(0, 3);

  const nationalList = (data?.sections?.national || fallbackByCat(['national', 'international'])).slice(0, 3);
  const stateList = (data?.sections?.state || fallbackByCat(['state'])).slice(0, 3);
  const businessList = (data?.sections?.business || fallbackByCat(['business'])).slice(0, 3);
  const sportsList = (data?.sections?.sports || fallbackByCat(['sports'])).slice(0, 3);
  const techList = (data?.sections?.technology || fallbackByCat(['technology', 'science'])).slice(0, 3);
  const educationList = (data?.sections?.education || fallbackByCat(['education', 'entertainment'])).slice(0, 3);

  const topStates = (data?.states || []).slice(0, 12);

  return (
    <PublicLayout breakingNews={data?.breaking || []}>
      <SeoHead
        title="Maheep News Portal — सच के साथ, जनता के विश्वास के साथ | News from India & Beyond"
        description="Bilingual Hindi and English digital newspaper covering National affairs, all 28 Indian States and 8 Union Territories, Business, Sports, Technology, Education, and daily E-Paper."
        canonicalPath="/"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* CRO High-Converting Morning E-Paper & Daily Briefing Strip */}
        {(growthConfig?.cro_sticky_bar_enabled ?? true) && (
          <div className="rounded-lg bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 border border-[#00652E]/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {growthConfig?.cro_cta_headline ||
                'Get India’s verified morning E-Paper & top dispatches free every morning at 7 AM IST'}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/epaper"
                onClick={() => trackGrowthEvent('epaper_open', { cta_variant: 'cro_top_strip' })}
                className="px-3.5 py-1.5 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold whitespace-nowrap transition-colors"
              >
                {growthConfig?.cro_cta_button || 'Get Free Daily E-Paper'}
              </Link>
              <Link
                to="/guides"
                className="px-3 py-1.5 rounded border border-[#00652E]/40 text-[#00652E] dark:text-[#4ade80] text-xs font-semibold hover:bg-white dark:hover:bg-neutral-900 whitespace-nowrap"
              >
                Citizen Guides
              </Link>
            </div>
          </div>
        )}

        <AdSlot placement="header_banner" />

        {loading && !data ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
            <div className="lg:col-span-8 h-80 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
            <div className="lg:col-span-4 h-80 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          </div>
        ) : (
          <>
            {/* Tier 1: Lead Story + Trending Sidebar */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-9 space-y-8">
                {leadArticle ? (
                  <NewsCard article={leadArticle} variant="lead" />
                ) : (
                  <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center text-neutral-500">
                    No published stories available for this language filter yet.
                  </div>
                )}

                {secondaryFeatured.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-editorial text-xl font-bold text-neutral-950 dark:text-white">
                        Featured Dispatches
                      </h2>
                      <Link to="/search" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
                        Browse All Stories
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {secondaryFeatured.map((art) => (
                        <NewsCard key={art.id} article={art} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Trending & Daily E-Paper Preview */}
              <aside className="lg:col-span-3 space-y-8">
                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 bg-white dark:bg-neutral-900">
                  <div className="flex items-center gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
                    <TrendingUp className="w-4 h-4 text-[#DF2525]" />
                    <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">
                      Trending Stories
                    </h2>
                  </div>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {(data?.trending || []).slice(0, 5).map((art, idx) => (
                      <div key={art.id} className="py-3 first:pt-3 last:pb-0">
                        <div className="flex items-start gap-3">
                          <span className="font-mono-tabular text-sm font-bold text-[#00652E] dark:text-[#4ade80] mt-0.5">
                            0{idx + 1}
                          </span>
                          <div>
                            <Link
                              to={`/news/${art.slug}`}
                              className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100 hover:text-[#00652E] dark:hover:text-[#4ade80]"
                            >
                              {art.title}
                            </Link>
                            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                              {art.category_name} · {formatIndiaDate(art.published_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* E-Paper Preview Card */}
                {data?.latestEdition && (
                  <div className="rounded-lg bg-[#EAF5E5] dark:bg-[#00451F]/40 border border-[#00652E]/20 dark:border-[#159B42]/30 p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] mb-2">
                      <BookOpen className="w-4 h-4" />
                      <span>Today’s Digital Broadsheet</span>
                    </div>
                    <h3 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">
                      {data.latestEdition.title}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 font-mono-tabular">
                      {data.latestEdition.page_count} A4 Pages · {data.latestEdition.article_count} Stories
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        to="/epaper"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#00652E] text-white text-xs font-semibold hover:bg-[#00451F] transition-colors whitespace-nowrap"
                      >
                        Read E-Paper
                      </Link>
                      <a
                        href={data.latestEdition.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1 py-2 px-3 rounded border border-[#00652E] text-[#00652E] dark:text-[#4ade80] dark:border-[#4ade80] text-xs font-semibold hover:bg-white dark:hover:bg-neutral-900 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" /> Print
                      </a>
                    </div>
                  </div>
                )}

                <PollWidget />

                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 space-y-2.5 text-xs">
                  <Link
                    to="/briefing"
                    className="flex items-center justify-between gap-2 font-semibold text-neutral-900 dark:text-neutral-100 hover:text-[#00652E]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
                      60s Audio Briefing &amp; Ask AI
                    </span>
                    <span>→</span>
                  </Link>
                  <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2.5">
                    <Link
                      to="/timelines"
                      className="flex items-center justify-between gap-2 font-semibold text-neutral-900 dark:text-neutral-100 hover:text-[#00652E]"
                    >
                      <span className="inline-flex items-center gap-2">
                        <History className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
                        News Timelines &amp; Public Data
                      </span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                <AdSlot placement="sidebar" />
              </aside>
            </section>

            {/* Tier 2: Latest News Grid */}
            <section className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                  Latest News
                </h2>
                <Link
                  to="/search"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                >
                  All Latest <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {latestFeed.slice(0, 4).map((art) => (
                  <NewsCard key={art.id} article={art} />
                ))}
              </div>
            </section>

            <AdSlot placement="homepage_mid" />

            {/* Tier 3: National & States Split */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-[#00652E]">
                  <h2 className="font-editorial text-xl font-bold text-neutral-950 dark:text-white">
                    National &amp; Policy
                  </h2>
                  <Link to="/national" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
                    View National Desk
                  </Link>
                </div>
                <div>
                  {nationalList.map((art) => (
                    <NewsCard key={art.id} article={art} variant="compact" />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-[#00652E]">
                  <h2 className="font-editorial text-xl font-bold text-neutral-950 dark:text-white">
                    States &amp; Regions
                  </h2>
                  <Link to="/states" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
                    All 28 States &amp; 8 UTs
                  </Link>
                </div>
                <div>
                  {stateList.length > 0 ? (
                    stateList.map((art) => <NewsCard key={art.id} article={art} variant="compact" />)
                  ) : (
                    <p className="text-xs text-neutral-500 py-4">Regional dispatches updating shortly.</p>
                  )}
                </div>

                {/* Quick State Directory Links */}
                <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-[#00652E]" />
                    <span>Explore Regional Editions</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {topStates.map((st) => (
                      <Link
                        key={st.id}
                        to={`/states/${st.slug}`}
                        className="text-neutral-700 dark:text-neutral-300 hover:text-[#00652E] dark:hover:text-[#4ade80] hover:underline"
                      >
                        {st.name}
                      </Link>
                    ))}
                    <Link to="/states" className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
                      All 36 States &amp; UTs →
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Tier 4: Business, Sports, Technology & Education */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-300 dark:border-neutral-700">
                  <h2 className="font-editorial text-lg font-bold">Business</h2>
                  <Link to="/business-sports" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">More</Link>
                </div>
                {businessList.map((art) => (
                  <NewsCard key={art.id} article={art} variant="compact" />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-300 dark:border-neutral-700">
                  <h2 className="font-editorial text-lg font-bold">Sports</h2>
                  <Link to="/business-sports?tab=sports" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">More</Link>
                </div>
                {sportsList.length > 0 ? (
                  sportsList.map((art) => <NewsCard key={art.id} article={art} variant="compact" />)
                ) : (
                  <p className="text-xs text-neutral-500 py-4">Sports dispatches updating shortly.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-300 dark:border-neutral-700">
                  <h2 className="font-editorial text-lg font-bold">Technology &amp; Science</h2>
                  <Link to="/search?category=technology" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">More</Link>
                </div>
                {techList.map((art) => (
                  <NewsCard key={art.id} article={art} variant="compact" />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-300 dark:border-neutral-700">
                  <h2 className="font-editorial text-lg font-bold">Education &amp; Culture</h2>
                  <Link to="/search?category=education" className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">More</Link>
                </div>
                {educationList.map((art) => (
                  <NewsCard key={art.id} article={art} variant="compact" />
                ))}
              </div>
            </section>

            {/* Content Marketing: Citizen Guides, Explainers & Videos */}
            {guides.length > 0 && (
              <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-5 h-5 text-[#00652E] dark:text-[#4ade80]" />
                    <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                      Citizen Guides, Explainers &amp; Videos
                    </h2>
                  </div>
                  <Link
                    to="/guides"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                  >
                    Explore Library <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {guides.slice(0, 3).map((g) => (
                    <Link
                      key={g.id}
                      to={`/guides/${g.slug}`}
                      className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 hover:border-[#00652E] transition-colors flex flex-col justify-between gap-2"
                    >
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#00652E] dark:text-[#4ade80]">
                          {g.guide_type} · {g.category}
                        </div>
                        <h3 className="font-editorial text-base font-bold text-neutral-950 dark:text-white leading-snug">
                          {g.title}
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{g.summary}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                        Read Guide ({g.read_minutes} min) →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Newsletter Callout */}
            <section className="rounded-xl bg-[#EAF5E5] dark:bg-neutral-900 border border-[#00652E]/20 dark:border-neutral-800 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                  Morning Dispatch from Maheep News Portal
                </h2>
                <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                  Verified Hindi and English summaries of India’s Parliament, state capitals, markets, and daily E-Paper delivered at 7:00 AM IST.
                </p>
              </div>
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <input
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="reader@example.com"
                  className="px-4 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 min-w-[240px]"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-sm font-semibold whitespace-nowrap transition-colors"
                >
                  Subscribe
                </button>
              </form>
            </section>
            {newsletterFeedback && (
              <div className="-mt-8 space-y-1">
                <p className="text-sm font-medium text-[#00652E] dark:text-[#4ade80]">{newsletterFeedback}</p>
                {newsletterConfirmUrl && (
                  <a
                    href={newsletterConfirmUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs underline font-semibold text-[#00451F] dark:text-[#4ade80]"
                  >
                    Click to Confirm Subscription →
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
