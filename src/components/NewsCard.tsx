import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Article } from '../types/news.ts';
import { formatIndiaDate } from '../utils/date.ts';
import { ArticleImage } from './ArticleImage.tsx';

interface NewsCardProps {
  article: Article;
  variant?: 'standard' | 'compact' | 'lead';
}

export function NewsCard({ article, variant = 'standard' }: NewsCardProps) {
  const cleanCity = article.city_name ? article.city_name.replace(' (town)', '') : '';
  const metaItems = [
    article.category_name || 'News',
    cleanCity && cleanCity !== article.state_name ? cleanCity : '',
    article.state_name,
    article.source_name,
    formatIndiaDate(article.published_at),
  ].filter(Boolean);

  if (variant === 'compact') {
    return (
      <article className="group py-4 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-[#00652E] dark:text-[#4ade80] font-medium mb-1">
          {metaItems.map((item, idx) => (
            <span key={idx} className="inline-flex items-center gap-2">
              {idx > 0 && <span aria-hidden="true" className="text-neutral-400">·</span>}
              <span>{item}</span>
            </span>
          ))}
        </div>
        <Link
          to={`/news/${article.slug}`}
          className="block font-editorial text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100 group-hover:text-[#00652E] dark:group-hover:text-[#4ade80] transition-colors"
        >
          {article.title}
        </Link>
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
          {article.summary}
        </p>
      </article>
    );
  }

  if (variant === 'lead') {
    return (
      <article className="group grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pb-8 border-b border-neutral-200 dark:border-neutral-800">
        <div className="lg:col-span-7 flex flex-col">
          <div className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900 aspect-[16/10] lg:flex-1 lg:min-h-[340px]">
            <ArticleImage
              src={article.image_url}
              alt={article.title}
              href={`/news/${article.slug}`}
              category={article.category_name}
              sourceName={article.source_name}
              imageRights={article.image_rights}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
          {article.image_rights && (
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {article.image_rights}
            </p>
          )}
        </div>
        <div className="lg:col-span-5 flex flex-col justify-between py-1">
          <div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] mb-3">
              {Boolean(article.breaking) && (
                <>
                  <span className="text-[#DF2525] font-bold">BREAKING</span>
                  <span aria-hidden="true" className="text-neutral-400">·</span>
                </>
              )}
              {metaItems.map((item, idx) => (
                <span key={idx} className="inline-flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true" className="text-neutral-400">·</span>}
                  <span>{item}</span>
                </span>
              ))}
            </div>
            <Link to={`/news/${article.slug}`}>
              <h2 className="font-editorial text-2xl sm:text-3xl font-bold leading-tight text-neutral-950 dark:text-white group-hover:text-[#00652E] dark:group-hover:text-[#4ade80] transition-colors">
                {article.title}
              </h2>
            </Link>
            <p className="mt-4 text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {article.summary}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>By {article.author}</span>
            <Link
              to={`/news/${article.slug}`}
              className="inline-flex items-center gap-1.5 font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
            >
              Read Full Report <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden transition-colors hover:border-[#00652E]/40 dark:hover:border-[#159B42]/50">
      <div className="block aspect-[4/3] overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <ArticleImage
          src={article.image_url}
          alt={article.title}
          href={`/news/${article.slug}`}
          category={article.category_name}
          sourceName={article.source_name}
          imageRights={article.image_rights}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="font-semibold text-[#00652E] dark:text-[#4ade80]">{article.category_name || 'News'}</span>
            {cleanCity && cleanCity !== article.state_name && (
              <>
                <span aria-hidden="true">·</span>
                <span>{cleanCity}</span>
              </>
            )}
            {article.state_name && (
              <>
                <span aria-hidden="true">·</span>
                <span>{article.state_name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{formatIndiaDate(article.published_at)}</span>
          </div>
          <Link to={`/news/${article.slug}`}>
            <h3 className="font-editorial text-lg font-bold leading-snug text-neutral-900 dark:text-neutral-100 group-hover:text-[#00652E] dark:group-hover:text-[#4ade80] transition-colors line-clamp-3">
              {article.title}
            </h3>
          </Link>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-3 leading-relaxed">
            {article.summary}
          </p>
        </div>
        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="truncate max-w-[160px]">{article.source_name}</span>
          <Link
            to={`/news/${article.slug}`}
            className="inline-flex items-center gap-1 font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap shrink-0"
          >
            Read more <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}
