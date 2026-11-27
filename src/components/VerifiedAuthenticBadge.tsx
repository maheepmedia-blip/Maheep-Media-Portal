import { Camera, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface VerifiedAuthenticBadgeProps {
  sourceName?: string;
  imageRights?: string;
  category?: string;
  variant?: 'overlay' | 'inline';
  className?: string;
}

export function VerifiedAuthenticBadge({
  sourceName,
  imageRights,
  category,
  variant = 'overlay',
  className = '',
}: VerifiedAuthenticBadgeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleTrigger = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const triggerButton =
    variant === 'inline' ? (
      <button
        type="button"
        onClick={handleTrigger}
        title="100% Real Photojournalism — Click to learn about our non-AI imagery commitment"
        className={`inline-flex items-center gap-1 text-[11px] font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00652E] rounded no-print ${className}`}
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Verified Authentic</span>
      </button>
    ) : (
      <div className={`group/badge relative inline-block no-print ${className}`}>
        <button
          type="button"
          onClick={handleTrigger}
          aria-label="Verified Authentic real non-AI news photograph — click for editorial policy details"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-950/80 hover:bg-[#00652E] text-white border border-white/25 backdrop-blur-sm text-[11px] font-semibold tracking-tight transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80]"
        >
          <ShieldCheck className="w-3 h-3 text-[#4ade80] group-hover/badge:text-white shrink-0" />
          <span>Verified Authentic</span>
        </button>

        {/* Accessible hover/focus tooltip */}
        <div
          role="tooltip"
          className="pointer-events-none opacity-0 group-hover/badge:opacity-100 group-focus-within/badge:opacity-100 transition-opacity duration-150 absolute bottom-full right-0 mb-1.5 w-60 p-2.5 rounded-md bg-neutral-950 text-white border border-neutral-700 shadow-lg text-[11px] leading-snug text-left z-20"
        >
          <div className="font-semibold text-[#4ade80]">100% Real · Non-AI Imagery</div>
          <div className="text-neutral-200 mt-0.5">
            Sourced from verified photojournalism or public archives—never AI-generated. Click for details.
          </div>
        </div>
      </div>
    );

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4 no-print"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verified-authentic-modal-title"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-[#FBF9F5] dark:bg-neutral-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/60 text-[#00652E] dark:text-[#4ade80]">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h3
                      id="verified-authentic-modal-title"
                      className="font-editorial text-lg font-bold text-neutral-950 dark:text-white leading-tight"
                    >
                      Verified Authentic Photography
                    </h3>
                    <p className="text-xs text-[#00652E] dark:text-[#4ade80] font-medium">
                      Maheep News Portal · Journalistic Integrity Standard
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close verification details"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-sm leading-relaxed">
                <p className="text-neutral-700 dark:text-neutral-300">
                  Maheep News Portal is committed to publishing{' '}
                  <strong className="text-neutral-950 dark:text-white">
                    100% real, non-AI-generated photography
                  </strong>{' '}
                  across all news dispatches, regional coverage, and digital E-Paper editions.
                </p>

                <ul className="space-y-2.5 text-xs text-neutral-700 dark:text-neutral-300 border-t border-b border-neutral-200 dark:border-neutral-800 py-3.5">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-neutral-950 dark:text-white">Zero Synthetic Media:</strong>{' '}
                      Generative AI images, deepfakes, and fabricated scenes are strictly excluded from news articles.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Camera className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-neutral-950 dark:text-white">Documented Provenance:</strong>{' '}
                      Visuals are vetted from accredited news wires, editorial correspondents, or verified Wikimedia Commons documentary archives.
                    </span>
                  </li>
                </ul>

                {(sourceName || imageRights || category) && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-[#FBF9F5] dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
                    {sourceName && (
                      <div>
                        <dt className="text-neutral-500 dark:text-neutral-400">Source / Desk</dt>
                        <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">{sourceName}</dd>
                      </div>
                    )}
                    {imageRights && (
                      <div>
                        <dt className="text-neutral-500 dark:text-neutral-400">Attribution &amp; Rights</dt>
                        <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">{imageRights}</dd>
                      </div>
                    )}
                    {category && (
                      <div>
                        <dt className="text-neutral-500 dark:text-neutral-400">Editorial Desk</dt>
                        <dd className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">{category}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-neutral-500 dark:text-neutral-400">Verification Status</dt>
                      <dd className="font-semibold text-[#00652E] dark:text-[#4ade80] mt-0.5">
                        Non-AI Real Photo
                      </dd>
                    </div>
                  </dl>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold transition-colors"
                  >
                    Understood
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {triggerButton}
      {modal}
    </>
  );
}
