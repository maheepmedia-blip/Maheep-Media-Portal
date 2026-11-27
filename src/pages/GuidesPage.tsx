import { ArrowLeft, BookOpen, CheckSquare, Clock, FileText, PlayCircle, Search, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { ArticleImage } from '../components/ArticleImage.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { ContentGuide } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';
import { buildShareUrl, trackGrowthEvent } from '../utils/utm.ts';

const TYPE_META: Record<ContentGuide['guide_type'], { label: string; icon: typeof BookOpen }> = {
  guide: { label: 'Citizen Guide', icon: BookOpen },
  explainer: { label: 'Deep Explainer', icon: FileText },
  video: { label: 'Video Dispatch', icon: PlayCircle },
  checklist: { label: 'Action Checklist', icon: CheckSquare },
};

function getSafeVideoEmbed(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/embed/')) return u.toString();
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be' && u.pathname.slice(1)) {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function GuidesPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { language } = usePortal();
  const [guides, setGuides] = useState<ContentGuide[]>([]);
  const [activeGuide, setActiveGuide] = useState<ContentGuide | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | ContentGuide['guide_type']>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (slug) {
      setLoading(true);
      fetch(`/api/guides/${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : { guide: null }))
        .then((json) => setActiveGuide(json.guide || null))
        .catch(() => setActiveGuide(null))
        .finally(() => setLoading(false));
      return;
    }

    setActiveGuide(null);
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (language !== 'all') params.set('language', language);
    if (q.trim()) params.set('q', q.trim());

    fetch(`/api/guides?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setGuides(json.guides || []))
      .catch(() => setGuides([]))
      .finally(() => setLoading(false));
  }, [slug, typeFilter, language, q]);

  const handleShare = async (guide: ContentGuide, platform: 'whatsapp' | 'x' | 'linkedin' | 'copy') => {
    const shareUrl = buildShareUrl(`/guides/${guide.slug}`, platform, 'content_marketing');
    trackGrowthEvent('share_click', { path: `/guides/${guide.slug}`, cta_variant: platform });
    void fetch(`/api/guides/${encodeURIComponent(guide.slug)}/share`, { method: 'POST' });

    if (platform === 'copy') {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Ignore clipboard failure
      }
      return;
    }

    const text = encodeURIComponent(`${guide.title} — Maheep News Portal`);
    const encodedUrl = encodeURIComponent(shareUrl);
    const dest =
      platform === 'whatsapp'
        ? `https://wa.me/?text=${text}%20${encodedUrl}`
        : platform === 'x'
        ? `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    window.location.assign(dest);
  };

  if (slug) {
    const embedUrl = activeGuide ? getSafeVideoEmbed(activeGuide.video_url) : null;
    return (
      <PublicLayout>
        {activeGuide && (
          <SeoHead
            title={`${activeGuide.title} — Guides | Maheep News Portal`}
            description={activeGuide.summary}
            canonicalPath={`/guides/${activeGuide.slug}`}
            ogType="article"
            ogImage={activeGuide.image_url || undefined}
            ogLocale={activeGuide.language === 'hi' ? 'hi_IN' : 'en_IN'}
            section={activeGuide.category}
            breadcrumbs={[
              { name: 'Home', path: '/' },
              { name: 'Guides & Videos', path: '/guides' },
              { name: activeGuide.title.slice(0, 60), path: `/guides/${activeGuide.slug}` },
            ]}
            jsonLd={{
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: activeGuide.title,
              description: activeGuide.summary,
              inLanguage: activeGuide.language === 'hi' ? 'hi-IN' : 'en-IN',
              author: { '@type': 'Person', name: activeGuide.author },
            }}
          />
        )}

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Link
            to="/guides"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Citizen Guides &amp; Explainers
          </Link>

          {loading ? (
            <div className="py-12 text-sm text-neutral-500">Loading guide...</div>
          ) : !activeGuide ? (
            <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
              <h1 className="font-editorial text-2xl font-bold">Guide Not Found</h1>
              <Link to="/guides" className="mt-4 inline-block px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold">
                Browse All Guides
              </Link>
            </div>
          ) : (
            <article className="space-y-6">
              <header className="space-y-3 pb-5 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                  <span>{TYPE_META[activeGuide.guide_type]?.label || 'Guide'}</span>
                  <span aria-hidden="true" className="text-neutral-400">·</span>
                  <span>{activeGuide.category}</span>
                  <span aria-hidden="true" className="text-neutral-400">·</span>
                  <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                    <Clock className="w-3.5 h-3.5" /> {activeGuide.read_minutes} min read
                  </span>
                </div>
                <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white leading-tight">
                  {activeGuide.title}
                </h1>
                <p className="text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {activeGuide.summary}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-neutral-500">
                  <span>
                    By <strong>{activeGuide.author}</strong> · Updated {formatIndiaDate(activeGuide.updated_at)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleShare(activeGuide, 'whatsapp')}
                      className="px-3 py-1 rounded bg-[#00652E] text-white font-semibold hover:bg-[#00451F]"
                    >
                      Share WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShare(activeGuide, 'x')}
                      className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-semibold hover:border-[#00652E]"
                    >
                      Share on X
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShare(activeGuide, 'copy')}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-semibold hover:border-[#00652E]"
                    >
                      <Share2 className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </header>

              {embedUrl && (
                <div className="aspect-video w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-black">
                  <iframe
                    src={embedUrl}
                    title={activeGuide.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {!embedUrl && activeGuide.image_url && (
                <div className="aspect-[16/9] max-h-[420px] w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <ArticleImage
                    src={activeGuide.image_url}
                    alt={activeGuide.title}
                    category={activeGuide.category}
                    sourceName={activeGuide.author || 'Maheep Editorial'}
                    imageRights="Wikimedia Commons / Editorial Archive"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="space-y-4 text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
                {activeGuide.body
                  .split(/\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
              </div>

              <AdSlot placement="article_inline" />
            </article>
          )}
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <SeoHead
        title="Citizen Guides, Explainers & Video Briefings — Maheep News Portal"
        description="Step-by-step guides, UPSC/PCS newspaper reading strategies, fact-checking handbooks, cyber safety checklists, and video explainers from Maheep News Portal."
        canonicalPath="/guides"
        keywords="india citizen guides, fact check india, upsc current affairs strategy, cyber helpline 1930, maheep news explainers"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Guides & Videos', path: '/guides' },
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
              EVERGREEN RESOURCE LIBRARY · गाइड, एक्सप्लेनर एवं वीडियो
            </p>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
              Citizen Guides, Explainers &amp; Video Hub
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
              Practical handbooks, student explainers, safety checklists, and newsroom video briefings built to inform and empower readers across India.
            </p>
          </div>

          <div className="relative w-full lg:w-72">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search guides, UPSC, cyber safety..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <AdSlot placement="header_banner" />

        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'All Resources'],
            ['guide', 'Citizen Guides'],
            ['explainer', 'Explainers'],
            ['checklist', 'Checklists'],
            ['video', 'Video Dispatches'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                typeFilter === key
                  ? 'bg-[#00652E] text-white border-[#00652E]'
                  : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-[#00652E]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading guides...</div>
        ) : guides.length === 0 ? (
          <div className="p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center text-sm text-neutral-500">
            No guides match your filter yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g) => {
              const Icon = TYPE_META[g.guide_type]?.icon || BookOpen;
              return (
                <article
                  key={g.id}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-900 flex flex-col"
                >
                  {g.image_url && (
                    <div className="block aspect-[16/9] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <ArticleImage
                        src={g.image_url}
                        alt={g.title}
                        href={`/guides/${g.slug}`}
                        category={g.category}
                        sourceName={g.author || 'Maheep Editorial'}
                        imageRights="Wikimedia Commons / Editorial Archive"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[#00652E] dark:text-[#4ade80]">
                        <span className="inline-flex items-center gap-1">
                          <Icon className="w-3.5 h-3.5" />
                          {TYPE_META[g.guide_type]?.label || 'Guide'} · {g.category}
                        </span>
                        <span className="text-neutral-500 font-mono-tabular">{g.read_minutes} min</span>
                      </div>
                      <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white leading-snug">
                        <Link to={`/guides/${g.slug}`} className="hover:text-[#00652E] dark:hover:text-[#4ade80]">
                          {g.title}
                        </Link>
                      </h2>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3 leading-relaxed">
                        {g.summary}
                      </p>
                    </div>
                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{g.author}</span>
                      <Link
                        to={`/guides/${g.slug}`}
                        className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                      >
                        Read Full Guide →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
