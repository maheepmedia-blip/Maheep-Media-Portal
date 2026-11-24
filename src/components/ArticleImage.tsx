import { Newspaper } from 'lucide-react';
import { useState } from 'react';

interface ArticleImageProps {
  src?: string;
  alt: string;
  category?: string;
  className?: string;
}

export function ArticleImage({ src, alt, category, className = 'w-full h-full object-cover' }: ArticleImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
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
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
