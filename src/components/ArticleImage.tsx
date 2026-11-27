import { Newspaper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VerifiedAuthenticBadge } from './VerifiedAuthenticBadge.tsx';

interface ArticleImageProps {
  src?: string;
  alt: string;
  href?: string;
  category?: string;
  sourceName?: string;
  imageRights?: string;
  showAuthenticBadge?: boolean;
  className?: string;
}

export function ArticleImage({
  src,
  alt,
  href,
  category,
  sourceName,
  imageRights,
  showAuthenticBadge = true,
  className = 'w-full h-full object-cover',
}: ArticleImageProps) {
  const [failed, setFailed] = useState(false);
  const [useProxyFallback, setUseProxyFallback] = useState(false);

  useEffect(() => {
    setFailed(false);
    setUseProxyFallback(false);
  }, [src]);

  const resolvedSrc =
    src && useProxyFallback && src.startsWith('https://') && !src.startsWith('/api/media/photo')
      ? `/api/media/photo?u=${encodeURIComponent(src)}`
      : src;

  if (!resolvedSrc || failed) {
    const fallbackNode = (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#EAF5E5] via-neutral-100 to-neutral-200 dark:from-[#00451F]/40 dark:via-neutral-900 dark:to-neutral-800 text-[#00652E] dark:text-[#EAF5E5] p-6 text-center select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <Newspaper className="w-8 h-8 mb-2 opacity-75" />
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
          {category || 'Maheep Dispatch'}
        </span>
      </div>
    );
    return href ? (
      <Link to={href} className="block w-full h-full">
        {fallbackNode}
      </Link>
    ) : (
      fallbackNode
    );
  }

  const imageElement = (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useProxyFallback && src && src.startsWith('https://')) {
          setUseProxyFallback(true);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );

  return (
    <div className="relative w-full h-full">
      {href ? (
        <Link to={href} className="block w-full h-full">
          {imageElement}
        </Link>
      ) : (
        imageElement
      )}
      {showAuthenticBadge && (
        <div className="absolute bottom-2.5 right-2.5 z-10">
          <VerifiedAuthenticBadge
            variant="overlay"
            sourceName={sourceName}
            imageRights={imageRights}
            category={category}
          />
        </div>
      )}
    </div>
  );
}
