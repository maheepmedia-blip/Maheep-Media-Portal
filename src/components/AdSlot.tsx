import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.tsx';
import type { AdPlacement, Advertisement } from '../types/news.ts';

interface AdSlotProps {
  placement: AdPlacement;
  className?: string;
}

export function AdSlot({ placement, className = '' }: AdSlotProps) {
  const { language } = usePortal();
  const [ad, setAd] = useState<Advertisement | null>(null);
  const trackedIdRef = useRef<string>('');

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ placement });
    if (language === 'en' || language === 'hi') {
      qs.set('lang', language);
    }

    fetch(`/api/ads?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        const list = (json.ads || []) as Advertisement[];
        if (list.length === 0) {
          setAd(null);
          return;
        }
        // Pick primary active ad (rotate gently across session if multiple exist for same slot)
        const chosen = list[0];
        setAd(chosen);
      })
      .catch(() => {
        if (active) setAd(null);
      });

    return () => {
      active = false;
    };
  }, [placement, language]);

  useEffect(() => {
    if (!ad || trackedIdRef.current === ad.id) return;
    trackedIdRef.current = ad.id;
    fetch(`/api/ads/${encodeURIComponent(ad.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'impression' }),
      keepalive: true,
    }).catch(() => {});
  }, [ad]);

  if (!ad) return null;

  const trackClick = () => {
    fetch(`/api/ads/${encodeURIComponent(ad.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
      keepalive: true,
    }).catch(() => {});
  };

  const isSidebar = placement === 'sidebar';
  const isWide = placement === 'header_banner' || placement === 'homepage_mid' || placement === 'epaper_banner';

  const cardInner = isSidebar ? (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
      <div className="px-4 py-2 bg-[#EAF5E5]/70 dark:bg-neutral-800/70 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
        <span>Advertisement · विज्ञापन</span>
        {ad.advertiser && <span className="truncate max-w-[140px]">{ad.advertiser}</span>}
      </div>
      {ad.image_url && (
        <div className="aspect-[16/10] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <h3 className="font-editorial text-base font-bold text-neutral-950 dark:text-white leading-snug">
          {ad.title}
        </h3>
        {ad.description && (
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">{ad.description}</p>
        )}
        {ad.target_url && (
          <div className="pt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
            <span>{ad.cta_text || 'Learn More'}</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  ) : (
    <div
      className={`border border-neutral-200 dark:border-neutral-800 rounded-lg bg-[#EAF5E5]/40 dark:bg-neutral-900 overflow-hidden ${
        isWide ? 'p-4 sm:px-6 sm:py-4' : 'p-4 sm:p-5'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        <span>Advertisement · विज्ञापन</span>
        {ad.advertiser && <span>Sponsored by {ad.advertiser}</span>}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {ad.image_url && (
            <img
              src={ad.image_url}
              alt={ad.title}
              loading="lazy"
              className="w-24 sm:w-36 h-16 sm:h-20 object-cover rounded border border-neutral-200 dark:border-neutral-700 shrink-0 bg-white"
            />
          )}
          <div className="min-w-0">
            <h3 className="font-editorial text-base sm:text-lg font-bold text-neutral-950 dark:text-white leading-snug">
              {ad.title}
            </h3>
            {ad.description && (
              <p className="mt-1 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
                {ad.description}
              </p>
            )}
          </div>
        </div>
        {ad.target_url && (
          <span className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold shrink-0 whitespace-nowrap">
            {ad.cta_text || 'Learn More'}
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (!ad.target_url) {
    return <aside className={`no-print ${className}`} aria-label="Advertisement">{cardInner}</aside>;
  }

  if (ad.target_url.startsWith('/')) {
    return (
      <aside className={`no-print ${className}`} aria-label="Advertisement">
        <Link to={ad.target_url} onClick={trackClick} className="block group hover:opacity-95 transition-opacity">
          {cardInner}
        </Link>
      </aside>
    );
  }

  return (
    <aside className={`no-print ${className}`} aria-label="Advertisement">
      <a
        href={ad.target_url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={trackClick}
        className="block group hover:opacity-95 transition-opacity"
      >
        {cardInner}
      </a>
    </aside>
  );
}
