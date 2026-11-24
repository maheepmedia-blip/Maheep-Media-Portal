import { Award, Mail, Newspaper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NewsCard } from '../components/NewsCard.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import type { Article, AuthorProfile } from '../types/news.ts';

export function AuthorPage() {
  const { slug } = useParams();
  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [allAuthors, setAllAuthors] = useState<AuthorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (slug) {
      fetch(`/api/authors/${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
        .then((json) => {
          setAuthor(json.author || null);
          setArticles(json.articles || []);
        })
        .catch(() => {
          setAuthor(null);
          setArticles([]);
        })
        .finally(() => setLoading(false));
    } else {
      fetch('/api/authors')
        .then((r) => r.json())
        .then((json) => setAllAuthors(json.authors || []))
        .finally(() => setLoading(false));
    }
  }, [slug]);

  return (
    <PublicLayout>
      <SeoHead
        title={author ? `${author.name} — Maheep News Portal` : 'Editorial Team & Journalists — Maheep News Portal'}
        description={
          author
            ? author.bio || `${author.role_title} covering ${author.beat} at Maheep News Portal.`
            : 'Meet the journalists, correspondents, and editorial desks behind Maheep News Portal.'
        }
        canonicalPath={slug ? `/author/${slug}` : '/authors'}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading journalist profile...</div>
        ) : slug && author ? (
          <>
            <section className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[#EAF5E5]/50 dark:bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                  <Award className="w-3.5 h-3.5" /> {author.role_title} · {author.beat}
                </div>
                <h1 className="font-editorial text-3xl font-bold text-neutral-950 dark:text-white">{author.name}</h1>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 max-w-2xl">
                  {author.bio || 'Journalist and contributor at Maheep News Portal.'}
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-neutral-500">
                  {author.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {author.email}
                    </span>
                  )}
                  {author.twitter_handle && <span>X: {author.twitter_handle}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Newspaper className="w-3.5 h-3.5" /> {articles.length} published dispatches
                  </span>
                </div>
              </div>
              <Link
                to="/authors"
                className="px-3.5 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] self-start"
              >
                All Journalists
              </Link>
            </section>

            <section className="space-y-4">
              <h2 className="font-editorial text-2xl font-bold">Published Reports by {author.name}</h2>
              {articles.length === 0 ? (
                <p className="text-sm text-neutral-500">No published reports attributed to this journalist yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {articles.map((art) => (
                    <NewsCard key={art.id} article={art} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : slug ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center space-y-3">
            <h1 className="font-editorial text-2xl font-bold">Journalist Profile Not Found</h1>
            <Link to="/authors" className="inline-block px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold">
              View All Journalists
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="font-editorial text-3xl font-bold">Newsroom & Journalists</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                Editorial desks and correspondents covering national policy, Indian states, business, science, and culture.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {allAuthors.map((au) => (
                <Link
                  key={au.id}
                  to={`/author/${au.slug}`}
                  className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-[#00652E] transition-colors space-y-2"
                >
                  <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                    {au.role_title} · {au.beat}
                  </div>
                  <h2 className="font-editorial text-xl font-bold text-neutral-950 dark:text-white">{au.name}</h2>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3">{au.bio}</p>
                  <div className="text-[11px] font-mono-tabular text-neutral-500 pt-1">
                    {au.article_count ?? 0} published stories
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
