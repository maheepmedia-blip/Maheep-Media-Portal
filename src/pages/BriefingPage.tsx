import {
  BookmarkCheck,
  BookmarkPlus,
  Headphones,
  MessageSquareText,
  Newspaper,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { AiCitation, Article, Category, ReaderFollow } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';

interface BriefingPayload {
  language: 'en' | 'hi';
  script: string;
  headlineCount: number;
  stories: Array<{
    id: string;
    title: string;
    slug: string;
    summary: string;
    source_name: string;
    category_name?: string;
    published_at: string;
  }>;
}

const SAMPLE_QUESTIONS = [
  'What happened in Lucknow or Uttar Pradesh today?',
  'Summarize latest RBI, markets, or business developments',
  'What are the top national & infrastructure updates?',
  'आज की प्रमुख राष्ट्रीय और राज्यों की खबरें क्या हैं?',
];

export function BriefingPage() {
  const { language, readerToken, readerUser, setReaderDrawerOpen } = usePortal();
  const [tab, setTab] = useState<'ask' | 'briefing' | 'mynews'>('ask');

  // Ask MAHEEP AI state
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState(false);
  const [askAnswer, setAskAnswer] = useState('');
  const [askCitations, setAskCitations] = useState<AiCitation[]>([]);
  const [askDisclaimer, setAskDisclaimer] = useState('');
  const [askErr, setAskErr] = useState('');

  // Briefing & Podcast state
  const [briefLang, setBriefLang] = useState<'en' | 'hi'>(language === 'hi' ? 'hi' : 'en');
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  // My News personalized feed & topic follows
  const [categories, setCategories] = useState<Category[]>([]);
  const [follows, setFollows] = useState<ReaderFollow[]>([]);
  const [myFeed, setMyFeed] = useState<Article[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  useEffect(() => {
    setBriefLang(language === 'hi' ? 'hi' : 'en');
  }, [language]);

  useEffect(() => {
    setLoadingBrief(true);
    fetch(`/api/briefing?language=${briefLang}`)
      .then((r) => r.json())
      .then((json) => setBriefing(json))
      .catch(() => {})
      .finally(() => setLoadingBrief(false));
  }, [briefLang]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((json) => setCategories(json.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!readerToken) {
      setFollows([]);
      setMyFeed([]);
      return;
    }
    setLoadingFeed(true);
    Promise.all([
      fetch('/api/reader/follows', { headers: { Authorization: `Bearer ${readerToken}` } }).then((r) => r.json()),
      fetch('/api/reader/my-feed', { headers: { Authorization: `Bearer ${readerToken}` } }).then((r) => r.json()),
    ])
      .then(([fJson, feedJson]) => {
        setFollows(fJson.follows || []);
        setMyFeed(feedJson.articles || []);
      })
      .catch(() => {})
      .finally(() => setLoadingFeed(false));
  }, [readerToken]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const runAskAi = async (customQuery?: string) => {
    const q = (customQuery ?? query).trim();
    if (q.length < 2) return;
    if (customQuery) setQuery(customQuery);
    setAsking(true);
    setAskErr('');
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, language }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not process query.');
      setAskAnswer(json.answer || '');
      setAskCitations(json.citations || []);
      setAskDisclaimer(json.disclaimer || '');
    } catch (err) {
      setAskErr(err instanceof Error ? err.message : 'Network error');
    } finally {
      setAsking(false);
    }
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAskAi();
  };

  const playBriefingAudio = () => {
    if (!briefing?.script || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(briefing.script);
    utter.lang = briefLang === 'hi' ? 'hi-IN' : 'en-IN';
    utter.rate = speechRate;
    utter.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utter.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
    setPaused(false);
  };

  const togglePauseAudio = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const stopBriefingAudio = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const toggleTopicFollow = async (cat: Category) => {
    if (!readerToken) {
      setReaderDrawerOpen(true);
      return;
    }
    const exists = follows.some((f) => f.follow_type === 'category' && f.target_slug === cat.slug);
    if (exists) {
      const res = await fetch(`/api/reader/follows/category/${encodeURIComponent(cat.slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.ok) {
        setFollows((prev) => prev.filter((f) => !(f.follow_type === 'category' && f.target_slug === cat.slug)));
      }
    } else {
      const res = await fetch('/api/reader/follows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${readerToken}`,
        },
        body: JSON.stringify({
          follow_type: 'category',
          target_slug: cat.slug,
          target_label: cat.name,
        }),
      });
      if (res.ok) {
        const feedRes = await fetch('/api/reader/my-feed', {
          headers: { Authorization: `Bearer ${readerToken}` },
        });
        const fRes = await fetch('/api/reader/follows', {
          headers: { Authorization: `Bearer ${readerToken}` },
        });
        if (fRes.ok) setFollows((await fRes.json()).follows || []);
        if (feedRes.ok) setMyFeed((await feedRes.json()).articles || []);
      }
    }
  };

  return (
    <PublicLayout>
      <SeoHead
        title="Ask MAHEEP AI, Audio Briefing & My News — Maheep News Portal"
        description="Ask MAHEEP AI questions grounded in published articles, listen to the 60-second Hindi and English audio news bulletin, and curate your personalized My News feed."
        canonicalPath="/briefing"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <header className="pb-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
              महीप एआई डेस्क एवं ऑडियो बुलेटिन · Reader Intelligence
            </p>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
              Ask MAHEEP AI, Audio Briefing &amp; My News
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Source-grounded news answers, bilingual 60-second spoken bulletins, and your followed topics and states.
            </p>
          </div>

          <div className="inline-flex rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1 self-start">
            {([
              ['ask', 'Ask MAHEEP AI', Sparkles],
              ['briefing', '60s Audio Briefing', Headphones],
              ['mynews', 'My News Desk', Newspaper],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'bg-white dark:bg-neutral-800 text-[#00652E] dark:text-[#4ade80] shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </header>

        <AdSlot placement="homepage_mid" />

        {/* TAB 1: ASK MAHEEP AI */}
        {tab === 'ask' && (
          <section className="space-y-6">
            <form
              onSubmit={handleAskSubmit}
              className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-950 dark:text-white">
                <MessageSquareText className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
                <span>Ask about published India &amp; State coverage</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. What happened in Lucknow today? Or summarize economic updates..."
                  className="flex-1 px-4 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                />
                <button
                  type="submit"
                  disabled={asking}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  {asking ? 'Searching Reports...' : 'Ask MAHEEP AI'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {SAMPLE_QUESTIONS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void runAskAi(sample)}
                    className="text-xs px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 hover:border-[#00652E] text-neutral-700 dark:text-neutral-300 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </form>

            {askErr && (
              <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 text-sm text-[#DF2525]">
                {askErr}
              </div>
            )}

            {askAnswer && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
                  <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                    MAHEEP AI Response
                  </div>
                  <div className="text-base leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-line">
                    {askAnswer}
                  </div>
                  {askDisclaimer && (
                    <p className="pt-3 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                      {askDisclaimer}
                    </p>
                  )}
                </div>

                <div className="lg:col-span-5 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[#EAF5E5]/40 dark:bg-neutral-900 space-y-3">
                  <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">
                    Cited Published Reports ({askCitations.length})
                  </h2>
                  {askCitations.length === 0 ? (
                    <p className="text-xs text-neutral-500">No matching archived headlines cited.</p>
                  ) : (
                    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {askCitations.map((cit) => (
                        <div key={cit.slug} className="py-3 first:pt-0 last:pb-0">
                          <Link
                            to={`/news/${cit.slug}`}
                            className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-[#00652E] dark:hover:text-[#4ade80] leading-snug block"
                          >
                            {cit.title}
                          </Link>
                          <div className="text-xs text-neutral-500 mt-1 font-mono-tabular">
                            {cit.source_name}
                            {cit.state_name ? ` · ${cit.state_name}` : ''} · {formatIndiaDate(cit.published_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: 60-SECOND AUDIO BRIEFING & PODCAST STUDIO */}
        {tab === 'briefing' && (
          <section className="space-y-6">
            <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
                <div>
                  <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                    Maheep News Podcast Studio · Spoken Edition
                  </div>
                  <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white mt-0.5">
                    60-Second {briefLang === 'hi' ? 'Hindi' : 'English'} Audio Bulletin
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        stopBriefingAudio();
                        setBriefLang('en');
                      }}
                      className={`px-3 py-1.5 font-semibold ${briefLang === 'en' ? 'bg-[#00652E] text-white' : ''}`}
                    >
                      English (EN)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopBriefingAudio();
                        setBriefLang('hi');
                      }}
                      className={`px-3 py-1.5 font-semibold ${briefLang === 'hi' ? 'bg-[#00652E] text-white' : ''}`}
                    >
                      हिन्दी (HI)
                    </button>
                  </div>

                  <select
                    value={speechRate}
                    onChange={(e) => setSpeechRate(Number(e.target.value))}
                    aria-label="Audio playback speed"
                    className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs font-mono-tabular"
                  >
                    <option value={0.9}>0.9x Speed</option>
                    <option value={1.0}>1.0x Normal</option>
                    <option value={1.2}>1.2x Brisk</option>
                  </select>
                </div>
              </div>

              {loadingBrief ? (
                <p className="text-sm text-neutral-500">Preparing today&apos;s bulletin script...</p>
              ) : !briefing ? (
                <p className="text-sm text-neutral-500">Bulletin unavailable.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={playBriefingAudio}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-sm font-semibold"
                    >
                      <Play className="w-4 h-4" />
                      {speaking ? 'Restart Bulletin' : 'Listen to Bulletin'}
                    </button>
                    {speaking && (
                      <>
                        <button
                          type="button"
                          onClick={togglePauseAudio}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
                        >
                          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          {paused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          onClick={stopBriefingAudio}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[#DF2525]/50 text-[#DF2525] text-xs font-semibold"
                        >
                          <Square className="w-3.5 h-3.5" /> Stop
                        </button>
                      </>
                    )}
                    <span className="text-xs text-neutral-500 font-mono-tabular">
                      Covers {briefing.headlineCount} top stories
                    </span>
                  </div>

                  <div className="p-5 rounded-lg bg-[#EAF5E5]/45 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-sm sm:text-base leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-line">
                    {briefing.script}
                  </div>

                  {briefing.stories.length > 0 && (
                    <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                      <h3 className="font-editorial text-lg font-bold mb-3">Stories Featured in This Bulletin</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {briefing.stories.map((st) => (
                          <Link
                            key={st.id}
                            to={`/news/${st.slug}`}
                            className="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-[#00652E] transition-colors block"
                          >
                            <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                              {st.category_name || 'News'} · {st.source_name}
                            </div>
                            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                              {st.title}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: MY NEWS DASHBOARD */}
        {tab === 'mynews' && (
          <section className="space-y-6">
            <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                    My News Desk {readerUser ? `· ${readerUser.name}` : ''}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Follow sections and states (on States page or India Map) to customize your personal front page.
                  </p>
                </div>
                {!readerUser && (
                  <button
                    type="button"
                    onClick={() => setReaderDrawerOpen(true)}
                    className="px-4 py-2 rounded-md bg-[#00652E] text-white text-xs font-semibold"
                  >
                    Sign In to Save My News
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const active = follows.some((f) => f.follow_type === 'category' && f.target_slug === cat.slug);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => void toggleTopicFollow(cat)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-[#00652E] text-white border-[#00652E]'
                          : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                      }`}
                    >
                      {active ? <BookmarkCheck className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {readerUser ? (
              loadingFeed ? (
                <p className="text-sm text-neutral-500">Building your personalized news feed...</p>
              ) : myFeed.length === 0 ? (
                <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-xl text-center text-sm text-neutral-500">
                  Follow at least one topic above or a state from the India News Map to tailor your feed.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myFeed.map((art) => (
                    <NewsCard key={art.id} article={art} />
                  ))}
                </div>
              )
            ) : (
              <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-xl text-center space-y-3 bg-white dark:bg-neutral-900">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Create a free Reader Desk profile to follow topics, journalists, and states across devices.
                </p>
                <button
                  type="button"
                  onClick={() => setReaderDrawerOpen(true)}
                  className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
                >
                  Open Reader Desk
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
