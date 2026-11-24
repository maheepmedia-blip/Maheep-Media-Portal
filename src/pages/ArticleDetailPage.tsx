import { ArrowLeft, Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArticleImage } from '../components/ArticleImage.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import type { Article } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';

export function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/articles/${encodeURIComponent(slug || '')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then((json) => {
        setArticle(json.article);
        setRelated(json.related || []);
      })
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <PublicLayout>
      {article && (
        <SeoHead
          title={`${article.title} — Maheep News Portal`}
          description={article.summary}
          canonicalPath={`/news/${article.slug}`}
          ogType="article"
          jsonLd={{
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: article.title,
            description: article.summary,
            datePublished: article.published_at,
            dateModified: article.updated_at,
            author: { '@type': 'Person', name: article.author },
            publisher: { '@type': 'Organization', name: 'Maheep News Portal' },
          }}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Front Page
        </Link>

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading article...</div>
        ) : !article ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
            <h1 className="font-editorial text-2xl font-bold">Story Not Found</h1>
            <p className="mt-2 text-sm text-neutral-500">The requested report may have been archived or moved.</p>
            <Link to="/" className="mt-4 inline-block px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold">
              Return to Homepage
            </Link>
          </div>
        ) : (
          <article className="space-y-6">
            <header className="space-y-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                <span>{article.category_name || 'News'}</span>
                {article.state_name && (
                  <>
                    <span aria-hidden="true" className="text-neutral-400">·</span>
                    <Link to={`/states/${article.state_slug}`} className="hover:underline">
                      {article.state_name}
                    </Link>
                  </>
                )}
                <span aria-hidden="true" className="text-neutral-400">·</span>
                <span>{article.language === 'hi' ? 'हिन्दी' : 'English'}</span>
              </div>

              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-neutral-950 dark:text-white">
                {article.title}
              </h1>

              <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed max-w-3xl">
                {article.summary}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-200">By {article.author}</span>
                  <span aria-hidden="true">·</span>
                  <span>{article.source_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{formatIndiaDateTime(article.published_at)}</span>
                </div>

                {/* Social Share Actions */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-neutral-500">
                    <Share2 className="w-3.5 h-3.5" /> Share:
                  </span>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    {copied ? <Check className="w-3 h-3 text-[#00652E]" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${article.title} ${shareUrl}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    WhatsApp
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    X
                  </a>
                </div>
              </div>
            </header>

            {article.image_url && (
              <figure className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900">
                <div className="aspect-[16/9] max-h-[460px] w-full">
                  <ArticleImage src={article.image_url} alt={article.title} category={article.category_name} />
                </div>
                <figcaption className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Photo credit: {article.source_name}
                </figcaption>
              </figure>
            )}

            <div className="max-w-3xl space-y-5 text-base sm:text-[17px] leading-[1.8] text-neutral-800 dark:text-neutral-200">
              {(article.content || article.summary).split(/\n+/).map((para, idx) => (
                <p
                  key={idx}
                  className={
                    idx === 0
                      ? 'first-letter:text-4xl first-letter:font-editorial first-letter:font-bold first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-[#00652E]'
                      : ''
                  }
                >
                  {para}
                </p>
              ))}
            </div>

            {article.source_url && (
              <div className="max-w-3xl p-4 rounded-lg bg-[#EAF5E5]/60 dark:bg-neutral-900 border border-[#00652E]/20 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-neutral-700 dark:text-neutral-300">
                  Original publisher attribution: <strong>{article.source_name}</strong>
                </span>
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                >
                  Visit Original Source <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {related.length > 0 && (
              <section className="pt-10 mt-10 border-t border-neutral-200 dark:border-neutral-800">
                <h2 className="font-editorial text-2xl font-bold mb-6">Related Stories</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {related.map((rel) => (
                    <NewsCard key={rel.id} article={rel} />
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </div>
    </PublicLayout>
  );
}
