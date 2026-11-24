import { ArrowLeft, Bookmark, Check, Copy, ExternalLink, MessageSquare, Share2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { ArticleImage } from '../components/ArticleImage.tsx';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article, CommentItem } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';

export function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { fontSize, setFontSize, readerToken, readerUser, setReaderDrawerOpen } = usePortal();

  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Article[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const [commentName, setCommentName] = useState('');
  const [commentEmail, setCommentEmail] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentMsg, setCommentMsg] = useState('');
  const [commentErr, setCommentErr] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/articles/${encodeURIComponent(slug || '')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then((json) => {
        setArticle(json.article);
        setRelated(json.related || []);
        setComments(json.comments || []);
      })
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (readerUser) {
      setCommentName((prev) => prev || readerUser.name);
      setCommentEmail((prev) => prev || readerUser.email);
    }
  }, [readerUser]);

  useEffect(() => {
    if (!readerToken || !article?.id) {
      setBookmarked(false);
      return;
    }
    // Track history silently for signed-in reader
    void fetch('/api/reader/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerToken}`,
      },
      body: JSON.stringify({ article_id: article.id }),
    });

    fetch('/api/reader/bookmarks', {
      headers: { Authorization: `Bearer ${readerToken}` },
    })
      .then((r) => (r.ok ? r.json() : { bookmarks: [] }))
      .then((json) => {
        const list = (json.bookmarks || []) as Article[];
        setBookmarked(list.some((b) => b.id === article.id));
      })
      .catch(() => {});
  }, [readerToken, article?.id]);

  const toggleBookmark = async () => {
    if (!readerToken || !article) {
      setReaderDrawerOpen(true);
      return;
    }
    if (bookmarked) {
      const res = await fetch(`/api/reader/bookmarks/${article.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.ok) setBookmarked(false);
    } else {
      const res = await fetch('/api/reader/bookmarks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${readerToken}`,
        },
        body: JSON.stringify({ article_id: article.id }),
      });
      if (res.ok) setBookmarked(true);
    }
  };

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

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!article) return;
    setSubmittingComment(true);
    setCommentMsg('');
    setCommentErr('');
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(article.slug)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: commentName,
          author_email: commentEmail,
          body: commentBody,
          reader_id: readerUser?.id || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not submit comment.');
      setCommentMsg(json.message);
      setCommentBody('');
    } catch (err) {
      setCommentErr(err instanceof Error ? err.message : 'Comment error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const bodyTextClass =
    fontSize === 'sm'
      ? 'text-[15px] leading-[1.75]'
      : fontSize === 'lg'
      ? 'text-[19px] sm:text-[20px] leading-[1.85]'
      : 'text-base sm:text-[17px] leading-[1.8]';

  return (
    <PublicLayout>
      {article && (
        <SeoHead
          title={`${article.title} — Maheep News Portal`}
          description={article.summary}
          canonicalPath={`/news/${article.slug}`}
          ogType="article"
          ogImage={article.image_url || undefined}
          breadcrumbs={[
            { name: 'Home', path: '/' },
            { name: article.category_name || 'News', path: `/search?category=${article.category_slug || 'national'}` },
            { name: article.title.slice(0, 60), path: `/news/${article.slug}` },
          ]}
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-neutral-500">
            <Link to="/" className="inline-flex items-center gap-1 font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline">
              <ArrowLeft className="w-3.5 h-3.5" /> Front Page
            </Link>
            {article?.category_name && (
              <>
                <span aria-hidden="true">/</span>
                <Link to={`/search?category=${article.category_slug || ''}`} className="hover:underline">
                  {article.category_name}
                </Link>
              </>
            )}
          </nav>

          {/* Accessibility Text Size & Bookmark */}
          {article && (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
                {(['sm', 'md', 'lg'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontSize(sz)}
                    title="Adjust article font size"
                    className={`px-2 py-1 font-semibold ${
                      fontSize === sz
                        ? 'bg-[#00652E] text-white'
                        : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {sz === 'sm' ? 'A-' : sz === 'md' ? 'A' : 'A+'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleBookmark}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-semibold transition-colors ${
                  bookmarked
                    ? 'bg-[#00652E] text-white border-[#00652E]'
                    : 'border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                {bookmarked ? 'Saved' : 'Save'}
              </button>
            </div>
          )}
        </div>

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
                {Boolean(article.ai_assisted) && (
                  <>
                    <span aria-hidden="true" className="text-neutral-400">·</span>
                    <span className="text-neutral-500 dark:text-neutral-400 font-normal">AI-Assisted Formatting · Editor Reviewed</span>
                  </>
                )}
              </div>

              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-neutral-950 dark:text-white">
                {article.title}
              </h1>

              <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed max-w-3xl">
                {article.summary}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to="/authors"
                    className="font-semibold text-neutral-900 dark:text-neutral-200 hover:text-[#00652E] hover:underline"
                  >
                    By {article.author}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>{article.source_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{formatIndiaDateTime(article.published_at)}</span>
                </div>

                {/* Social Share Actions */}
                <div className="flex flex-wrap items-center gap-2">
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
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    Facebook
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    Telegram
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

            <div className={`max-w-3xl space-y-5 text-neutral-800 dark:text-neutral-200 ${bodyTextClass}`}>
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

            <AdSlot placement="article_inline" className="max-w-3xl" />

            {/* Moderated Reader Discussion */}
            <section className="max-w-3xl pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#00652E]" />
                <h2 className="font-editorial text-xl font-bold">Reader Responses ({comments.length})</h2>
              </div>

              <form
                onSubmit={submitComment}
                className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder="Your name *"
                    className="px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                  <input
                    type="email"
                    value={commentEmail}
                    onChange={(e) => setCommentEmail(e.target.value)}
                    placeholder="Email (optional, never published)"
                    className="px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Share a respectful, fact-based response..."
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500">All reader comments are reviewed by moderators before publishing.</span>
                  <button
                    type="submit"
                    disabled={submittingComment}
                    className="px-4 py-1.5 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold"
                  >
                    {submittingComment ? 'Submitting...' : 'Submit Comment'}
                  </button>
                </div>
                {commentMsg && <p className="text-xs text-[#00652E] dark:text-[#4ade80] font-medium">{commentMsg}</p>}
                {commentErr && <p className="text-xs text-[#DF2525] font-medium">{commentErr}</p>}
              </form>

              {comments.length > 0 && (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {comments.map((cm) => (
                    <div key={cm.id} className="py-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100">{cm.author_name}</span>
                        <span className="text-neutral-500 font-mono-tabular">{formatIndiaDateTime(cm.created_at)}</span>
                      </div>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line">{cm.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

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
