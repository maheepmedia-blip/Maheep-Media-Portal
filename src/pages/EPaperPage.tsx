import {
  Bookmark,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Landmark,
  MapPin,
  Maximize2,
  Minimize2,
  Printer,
  Search,
  Share2,
  Square,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot.tsx';
import { AeoFaqSection, MAHEEP_EPAPER_FAQS } from '../components/AeoFaqSection.tsx';
import { ArticleImage } from '../components/ArticleImage.tsx';
import { DetailedWireEPaper } from '../components/DetailedWireEPaper.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { CANONICAL_ORIGIN, SeoHead } from '../components/SeoHead.tsx';
import { usePortal } from '../context/PortalContext.tsx';
import { fetchActiveAdsMerged } from '../services/adsFirestore.ts';
import type { Advertisement, Edition, EditionPage } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';
import { downloadEditionPdf } from '../utils/pdf.ts';
import { isEpaperPageSavedLocally, toggleSavedEpaperPageLocally } from '../utils/readerLists.ts';
import { speakNewspaperText, stopNewspaperSpeech } from '../utils/speech.ts';
import { trackGrowthEvent } from '../utils/utm.ts';

type PaperTheme = 'light' | 'sepia' | 'dark';
type ReaderViewMode = 'broadsheet' | 'article';
type TextScale = 'compact' | 'standard' | 'large';
type PaperSection = 'broadsheet' | 'beacon' | 'our-pride' | 'worldwire';

function parseSectionParam(sec: string | null): PaperSection {
  if (sec === 'beacon' || sec === 'our-pride' || sec === 'worldwire' || sec === 'broadsheet') {
    return sec;
  }
  return 'broadsheet';
}

interface ArchiveHit {
  edition_date: string;
  pageNumber: number;
  sectionTitle: string;
  title: string;
  slug?: string;
  summary: string;
}

function getDetailedStoryBody(summary: string, content?: string) {
  const cleanSummary = (summary || '').trim();
  const cleanContent = (content || '').trim();

  let standfirst = '';
  let paragraphs: string[] = [];

  if (!cleanContent || cleanContent === cleanSummary) {
    paragraphs = cleanSummary
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  } else {
    const bodyParas = cleanContent
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const startsWithSummary =
      cleanSummary.length > 20 &&
      bodyParas.length > 0 &&
      bodyParas[0].toLowerCase().startsWith(cleanSummary.slice(0, 40).toLowerCase());
    standfirst = startsWithSummary ? '' : cleanSummary;
    paragraphs = bodyParas;
  }

  const allWords = [standfirst, ...paragraphs].join(' ').trim().split(/\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.ceil(allWords / 180));
  return { standfirst, paragraphs, wordCount: allWords, readMins };
}

function BroadsheetSponsorBox({
  ad,
  paperTheme,
}: {
  ad: Advertisement;
  paperTheme: PaperTheme;
}) {
  const trackedRef = useRef<string>('');

  useEffect(() => {
    if (!ad?.id || trackedRef.current === ad.id) return;
    trackedRef.current = ad.id;
    fetch(`/api/ads/${encodeURIComponent(ad.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'impression' }),
      keepalive: true,
    }).catch(() => {});
  }, [ad?.id]);

  const trackClick = () => {
    fetch(`/api/ads/${encodeURIComponent(ad.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
      keepalive: true,
    }).catch(() => {});
  };

  const boxColors =
    paperTheme === 'sepia'
      ? 'bg-[#F3EBD8] border-[#B69F72] text-[#292118]'
      : paperTheme === 'dark'
      ? 'bg-neutral-900 border-[#159B42]/60 text-neutral-100'
      : 'bg-[#EAF5E5]/65 border-[#00652E] text-neutral-950';

  const content = (
    <div className={`border-2 rounded-md p-4 space-y-2.5 ${boxColors}`}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-75 border-b border-current/15 pb-1.5">
        <span>Advertisement · विज्ञापन</span>
        {ad.advertiser && <span>Sponsored by {ad.advertiser}</span>}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          {ad.image_url && (
            <img
              src={ad.image_url}
              alt={ad.title}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="w-24 sm:w-32 h-16 sm:h-20 object-cover rounded border border-current/15 shrink-0 bg-white"
            />
          )}
          <div className="min-w-0">
            <h4 className="font-editorial text-base sm:text-lg font-bold leading-snug">{ad.title}</h4>
            {ad.description && <p className="text-xs sm:text-sm opacity-85 mt-1 leading-relaxed">{ad.description}</p>}
          </div>
        </div>
        {ad.target_url && (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#00652E] text-white text-xs font-semibold shrink-0 whitespace-nowrap self-start sm:self-center">
            {ad.cta_text || 'Learn More'}
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (!ad.target_url) return content;
  if (ad.target_url.startsWith('/')) {
    return (
      <Link to={ad.target_url} onClick={trackClick} className="block hover:opacity-95 transition-opacity">
        {content}
      </Link>
    );
  }
  return (
    <a
      href={ad.target_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={trackClick}
      className="block hover:opacity-95 transition-opacity"
    >
      {content}
    </a>
  );
}

export function EPaperPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, setLanguage, readerToken, readerUser, setReaderDrawerOpen, selectedLocalCity } = usePortal();
  const isHi = language === 'hi';

  const initialSection = parseSectionParam(searchParams.get('section'));
  const [paperSection, setPaperSection] = useState<PaperSection>(initialSection);

  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [monthFilter, setMonthFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [translatingPage, setTranslatingPage] = useState(false);
  const [activeAds, setActiveAds] = useState<Advertisement[]>([]);

  const selectedDateRef = useRef<string>('');
  const currentPageIdxRef = useRef<number>(0);
  const translatedPageTokensRef = useRef<Set<string>>(new Set());

  // Smart Reader Controls
  const [zoom, setZoom] = useState<number>(100);
  const [paperTheme, setPaperTheme] = useState<PaperTheme>('light');
  const [viewMode, setViewMode] = useState<ReaderViewMode>('broadsheet');
  const [textScale, setTextScale] = useState<TextScale>('standard');
  const [fullscreen, setFullscreen] = useState(false);
  const [pageSaved, setPageSaved] = useState(false);
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sharedLinkNotice, setSharedLinkNotice] = useState(false);

  // Archive Search
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveHits, setArchiveHits] = useState<ArchiveHit[]>([]);
  const [searchingArchive, setSearchingArchive] = useState(false);
  const [showArchiveResults, setShowArchiveResults] = useState(false);

  useEffect(() => {
    const sec = searchParams.get('section');
    if (sec === 'beacon' || sec === 'our-pride' || sec === 'worldwire' || sec === 'broadsheet') {
      setPaperSection(sec);
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    fetchActiveAdsMerged({
      placement: 'epaper_banner',
      lang: language === 'en' || language === 'hi' ? language : 'all',
      allowFallback: true,
    })
      .then((list) => {
        if (active) setActiveAds(list);
      })
      .catch(() => {
        if (active) setActiveAds([]);
      });
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    selectedDateRef.current = selectedEdition?.edition_date || searchParams.get('date') || '';
  }, [selectedEdition?.edition_date, searchParams]);

  useEffect(() => {
    currentPageIdxRef.current = currentPageIdx;
  }, [currentPageIdx]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (monthFilter) params.set('month', monthFilter);
    params.set('lang', language);
    const activeDateParam = selectedDateRef.current || searchParams.get('date') || '';
    if (activeDateParam) params.set('date', activeDateParam);
    params.set('page', String(currentPageIdxRef.current + 1));

    fetch(`/api/editions?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        const list = (json.editions || []) as Edition[];
        setEditions(list);
        if (list.length > 0) {
          setSelectedEdition((prevEdition) => {
            const preferredDate = prevEdition?.edition_date || searchParams.get('date') || '';
            const matched = preferredDate ? list.find((e) => e.edition_date === preferredDate) : undefined;
            const nextEd = matched || list[0];
            if (!prevEdition) {
              const initialPage = Math.max(0, Number(searchParams.get('page') || '1') - 1);
              setCurrentPageIdx(initialPage);
            } else {
              setCurrentPageIdx((prevIdx) => {
                try {
                  const parsed = JSON.parse(nextEd.content_json || '{}');
                  const len = Array.isArray(parsed.pages) ? parsed.pages.length : 1;
                  return Math.min(prevIdx, Math.max(0, len - 1));
                } catch {
                  return 0;
                }
              });
            }
            return nextEd;
          });
        } else {
          setSelectedEdition(null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [monthFilter, language]);

  const pages: EditionPage[] = useMemo(() => {
    if (!selectedEdition) return [];
    try {
      const parsed = JSON.parse(selectedEdition.content_json || '{}');
      return Array.isArray(parsed.pages) ? parsed.pages : [];
    } catch {
      return [];
    }
  }, [selectedEdition]);

  const activePage = pages[currentPageIdx] || pages[0];
  const broadsheetAd = activeAds.length > 0 ? activeAds[currentPageIdx % activeAds.length] : null;

  // Lazily translate the active page if user flips to another page or selects another date in Hindi/English
  useEffect(() => {
    if (paperSection !== 'broadsheet') return;
    if (language !== 'hi' && language !== 'en') {
      setTranslatingPage(false);
      return;
    }
    if (!selectedEdition || !activePage) return;

    const token = `${selectedEdition.id}:${activePage.pageNumber}:${language}`;
    if (translatedPageTokensRef.current.has(token)) return;

    const hasDev = (s?: string) => /[\u0900-\u097F]/.test(String(s || ''));
    const needsLive = activePage.articles.some((a) =>
      language === 'hi'
        ? !hasDev(a.title) || (String(a.summary || '').trim().length > 20 && !hasDev(a.summary))
        : hasDev(a.title) || hasDev(a.summary),
    );

    if (!needsLive) {
      translatedPageTokensRef.current.add(token);
      return;
    }

    let cancelled = false;
    setTranslatingPage(true);
    fetch(
      `/api/editions/${encodeURIComponent(selectedEdition.id)}/page/${activePage.pageNumber}?lang=${encodeURIComponent(language)}`,
      { cache: 'no-store' },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.page) return;
        translatedPageTokensRef.current.add(token);
        const updatedPage = json.page as EditionPage;
        const patchEdition = (ed: Edition): Edition => {
          if (ed.id !== selectedEdition.id) return ed;
          try {
            const parsed = JSON.parse(ed.content_json || '{}');
            const currPages: EditionPage[] = Array.isArray(parsed.pages) ? parsed.pages : [];
            const nextPages = currPages.map((p) =>
              p.pageNumber === updatedPage.pageNumber ? updatedPage : p,
            );
            return { ...ed, content_json: JSON.stringify({ pages: nextPages }) };
          } catch {
            return ed;
          }
        };
        setSelectedEdition((prev) => (prev ? patchEdition(prev) : prev));
        setEditions((prevList) => prevList.map(patchEdition));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTranslatingPage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paperSection, selectedEdition?.id, currentPageIdx, language]);

  // Track reader continue-from-last-page progress + free local saved check
  useEffect(() => {
    if (!selectedEdition || !activePage) return;
    setPageSaved(isEpaperPageSavedLocally(selectedEdition.edition_date, activePage.pageNumber));
    if (!readerToken) return;
    void fetch('/api/reader/epaper-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerToken}`,
      },
      body: JSON.stringify({
        edition_date: selectedEdition.edition_date,
        page_number: activePage.pageNumber,
      }),
    });
  }, [readerToken, selectedEdition?.edition_date, activePage?.pageNumber]);

  // Keyboard page navigation, theme cycle, focus mode & shortcuts help
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'ArrowRight' && currentPageIdx < pages.length - 1) {
        setCurrentPageIdx((i) => Math.min(pages.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' && currentPageIdx > 0) {
        setCurrentPageIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false);
        if (shortcutsOpen) setShortcutsOpen(false);
      } else if (e.key.toLowerCase() === 'f') {
        setFullscreen((v) => !v);
      } else if (e.key.toLowerCase() === 't') {
        setPaperTheme((curr) => (curr === 'light' ? 'sepia' : curr === 'sepia' ? 'dark' : 'light'));
      } else if (e.key === '?') {
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPageIdx, pages.length, fullscreen, shortcutsOpen]);

  const handleDateChange = (dateVal: string, pageNum = 1) => {
    const found = editions.find((e) => e.edition_date === dateVal);
    if (found) {
      setSelectedEdition(found);
      setCurrentPageIdx(Math.max(0, pageNum - 1));
      setSearchParams({ date: found.edition_date, page: String(pageNum) }, { replace: true });
    }
  };

  const runArchiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (archiveQuery.trim().length < 2) return;
    setSearchingArchive(true);
    setShowArchiveResults(true);
    try {
      const res = await fetch(`/api/editions/search?q=${encodeURIComponent(archiveQuery.trim())}`);
      const json = await res.json();
      setArchiveHits(json.matches || []);
    } catch {
      setArchiveHits([]);
    } finally {
      setSearchingArchive(false);
    }
  };

  const bookmarkCurrentPage = async () => {
    if (!selectedEdition || !activePage) return;
    const savedNow = toggleSavedEpaperPageLocally({
      edition_date: selectedEdition.edition_date,
      page_number: activePage.pageNumber,
      section_title: activePage.sectionTitle,
    });
    setPageSaved(savedNow);
    if (!readerToken || !savedNow) return;
    await fetch('/api/reader/epaper-bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerToken}`,
      },
      body: JSON.stringify({
        edition_date: selectedEdition.edition_date,
        page_number: activePage.pageNumber,
        section_title: activePage.sectionTitle,
      }),
    }).catch(() => {});
  };

  const shareCurrentEdition = async () => {
    if (!selectedEdition || !activePage) return;
    const url = `${CANONICAL_ORIGIN}/epaper?date=${encodeURIComponent(selectedEdition.edition_date)}&page=${activePage.pageNumber}`;
    const shareTitle = `Maheep E-Paper (${selectedEdition.edition_date}) · Page ${activePage.pageNumber}`;
    trackGrowthEvent('share_click', { path: '/epaper', cta_variant: 'epaper_toolbar_share' });
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: activePage.sectionTitle, url });
        return;
      } catch {
        // User dismissed or unsupported, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareTitle}\n${url}`);
      setSharedLinkNotice(true);
      window.setTimeout(() => setSharedLinkNotice(false), 2200);
    } catch {
      // Ignore clipboard error
    }
  };

  useEffect(() => {
    stopNewspaperSpeech();
    setSpeakingTarget(null);
  }, [currentPageIdx, selectedEdition?.edition_date, paperSection]);

  useEffect(() => {
    return () => {
      stopNewspaperSpeech();
    };
  }, []);

  const togglePageSpeech = () => {
    if (!activePage || activePage.articles.length === 0) return;
    if (speakingTarget === 'page') {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    const pageTranscript = activePage.articles
      .slice(0, 6)
      .map((art, i) => `${isHi ? 'समाचार' : 'Story'} ${i + 1}. ${art.title}. ${art.summary || ''}`)
      .join(' ');
    speakNewspaperText(`${activePage.sectionTitle}. ${pageTranscript}`, {
      lang: isHi ? 'hi' : 'en',
      onStart: () => setSpeakingTarget('page'),
      onEnd: () => setSpeakingTarget((curr) => (curr === 'page' ? null : curr)),
    });
  };

  const toggleStorySpeech = (key: string, title: string, summary: string) => {
    if (speakingTarget === key) {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    speakNewspaperText(`${title}. ${summary || ''}`, {
      lang: isHi ? 'hi' : 'en',
      onStart: () => setSpeakingTarget(key),
      onEnd: () => setSpeakingTarget((curr) => (curr === key ? null : curr)),
    });
  };

  const copyStoryClip = async (
    key: string,
    art: { title: string; summary: string; source_name?: string; slug?: string },
  ) => {
    const shareUrl = art.slug
      ? `${window.location.origin}/news/${art.slug}`
      : `${window.location.origin}/epaper?date=${encodeURIComponent(selectedEdition?.edition_date || '')}&page=${activePage?.pageNumber || 1}`;
    const clipText = `${art.title}\n\n${art.summary}\n\n— ${art.source_name || 'Maheep News Portal'} (${selectedEdition?.edition_date || ''})\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(clipText);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      // Clipboard unavailable in restricted browser context
    }
  };

  const sheetClass =
    paperTheme === 'sepia'
      ? 'bg-[#F7F0DF] text-[#292118] border-[#D9CAAE]'
      : paperTheme === 'dark'
      ? 'bg-neutral-950 text-neutral-100 border-neutral-800'
      : 'bg-[#FCFBF8] text-neutral-950 border-neutral-300';

  const bodyScaleClass =
    textScale === 'compact'
      ? 'text-[13px] leading-relaxed'
      : textScale === 'large'
      ? 'text-base sm:text-[17px] leading-[1.7]'
      : 'text-sm sm:text-[15px] leading-relaxed';

  const articleScaleClass =
    textScale === 'compact'
      ? 'text-sm sm:text-[15px] leading-relaxed'
      : textScale === 'large'
      ? 'text-[17px] sm:text-lg leading-[1.75]'
      : 'text-base leading-relaxed';

  const clickableIndex = pages.flatMap((p, pIdx) =>
    p.articles.slice(0, 3).map((a) => ({
      pageNumber: p.pageNumber,
      pageIdx: pIdx,
      sectionTitle: p.sectionTitle,
      title: a.title,
    })),
  );

  const epaperSeoTitle =
    paperSection === 'beacon'
      ? 'The Beacon E-Paper — India National & 36 States | Best E-Paper Site'
      : paperSection === 'our-pride'
        ? 'Our Pride City E-Paper — 339 Indian Cities | Best E-Paper Site'
        : paperSection === 'worldwire'
          ? 'WorldWire E-Paper — 50 Countries | Best E-Paper Site'
          : 'Best E-Paper Site — Maheep E-Paper | 25-Page Free Digital Broadsheet';

  return (
    <PublicLayout>
      <SeoHead
        title={epaperSeoTitle}
        description="Read Maheep E-Paper (https://maheep-media-news.onrender.com/epaper) — India’s best free daily e-paper site. Browse 25-page A4 editions in English & Hindi across The Beacon (National & 36 States), Our Pride (339 Cities), and WorldWire (50 Countries) with PDF export and audio narration."
        canonicalPath={paperSection === 'broadsheet' ? '/epaper' : `/epaper?section=${paperSection}`}
        keywords="best epaper site, maheep epaper, free daily epaper india, hindi epaper pdf download, our pride local epaper, the beacon national epaper, worldwire epaper"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Best E-Paper Site — Maheep E-Paper', path: '/epaper' },
        ]}
        faqItems={MAHEEP_EPAPER_FAQS}
        speakableSelectors={['h1', '.aeo-answer-block']}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Maheep E-Paper — Best E-Paper Site',
          url: `${CANONICAL_ORIGIN}/epaper`,
          applicationCategory: 'NewsApplication',
          operatingSystem: 'Web',
          isAccessibleForFree: true,
          inLanguage: ['en-IN', 'hi-IN'],
        }}
      />

      <div className={`${fullscreen ? 'max-w-6xl' : 'max-w-7xl'} mx-auto px-4 sm:px-6 py-8 space-y-6`}>
        {/* Controls Toolbar */}
        {!fullscreen && (
          <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
            <div>
              <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                {isHi
                  ? 'ई-पेपर स्मार्ट रीडर · संपूर्ण हिंदी डिजिटल समाचार पत्र'
                  : 'ई-पेपर स्मार्ट रीडर · Detailed Digital Broadsheet'}
              </p>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
                {isHi ? 'महीप दैनिक ई-पेपर एवं आर्काइव' : 'Maheep Daily E-Paper & Archive'}
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {isHi
                  ? 'पूर्ण बहु-स्तंभ हिंदी व अंग्रेज़ी समाचार पत्र, स्रोत विवरण, आर्टिकल मोड और प्रिंट/पीडीएफ सुविधा के साथ।'
                  : 'Full multi-column newspaper editions with complete stories, source attribution, Article Mode, and PDF export.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Inline Newspaper Language Switcher */}
              <div
                className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900 text-xs"
                role="group"
                aria-label="Newspaper Language"
              >
                {(['all', 'en', 'hi'] as const).map((langOpt) => (
                  <button
                    key={langOpt}
                    type="button"
                    onClick={() => setLanguage(langOpt)}
                    className={`px-2.5 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                      language === langOpt
                        ? 'bg-[#00652E] text-white'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-[#EAF5E5] dark:hover:bg-neutral-800'
                    }`}
                  >
                    {langOpt === 'all' ? 'All' : langOpt === 'en' ? 'English' : 'हिन्दी'}
                  </button>
                ))}
              </div>

              {paperSection === 'broadsheet' && (
                <>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    <Calendar className="w-4 h-4 text-[#00652E]" />
                    <input
                      type="month"
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
                    />
                  </label>

                  {editions.length > 0 && (
                    <select
                      value={selectedEdition?.edition_date || ''}
                      onChange={(e) => handleDateChange(e.target.value)}
                      aria-label="Select edition date"
                      className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono-tabular"
                    >
                      {editions.map((ed) => (
                        <option key={ed.id} value={ed.edition_date}>
                          {ed.edition_date} — {ed.page_count} {isHi ? 'पृष्ठ' : 'Pages'} · {ed.article_count}{' '}
                          {isHi ? 'समाचार' : 'Reports'}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedEdition && (
                    <>
                      <button
                        type="button"
                        onClick={() => downloadEditionPdf(selectedEdition, activeAds)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] whitespace-nowrap"
                      >
                        <Printer className="w-3.5 h-3.5" /> {isHi ? 'प्रिंट' : 'Print'}
                      </button>
                      <a
                        href={`/api/editions/${selectedEdition.id}/html?lang=${encodeURIComponent(language)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Full HTML
                      </a>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* E-Newspaper Edition Mode Switcher: Full Broadsheet vs Beacon / Our Pride / WorldWire 300 */}
        {!fullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4 no-print">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="E-Newspaper Edition Section">
              <button
                type="button"
                role="tab"
                aria-selected={paperSection === 'broadsheet'}
                onClick={() => {
                  setPaperSection('broadsheet');
                  setSearchParams(
                    selectedEdition ? { date: selectedEdition.edition_date, page: String(currentPageIdx + 1) } : {},
                    { replace: true },
                  );
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  paperSection === 'broadsheet'
                    ? 'bg-[#00652E] text-white'
                    : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:border-[#00652E] border border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                {isHi ? 'पूर्ण ब्रॉडशीट संस्करण' : 'Full Broadsheet Edition'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paperSection === 'beacon'}
                onClick={() => {
                  setPaperSection('beacon');
                  setSearchParams({ section: 'beacon', scopeType: 'country', slug: 'india' }, { replace: true });
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  paperSection === 'beacon'
                    ? 'bg-[#00652E] text-white'
                    : 'bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 text-[#00652E] dark:text-[#4ade80] border border-[#00652E]/30 hover:bg-[#00652E] hover:text-white'
                }`}
              >
                <Landmark className="w-4 h-4" />
                {isHi ? 'द बीकन · भारत एवं 36 राज्य (300 समाचार)' : 'The Beacon · India & 36 States (300/State)'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paperSection === 'our-pride'}
                onClick={() => {
                  setPaperSection('our-pride');
                  const city = searchParams.get('city') || selectedLocalCity || 'mumbai';
                  setSearchParams({ section: 'our-pride', scopeType: 'city', slug: city, city }, { replace: true });
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  paperSection === 'our-pride'
                    ? 'bg-[#00652E] text-white'
                    : 'bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 text-[#00652E] dark:text-[#4ade80] border border-[#00652E]/30 hover:bg-[#00652E] hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4" />
                {isHi ? 'अवर प्राइड · 339 शहर (300/शहर)' : 'Our Pride · 339 Cities (300/City)'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paperSection === 'worldwire'}
                onClick={() => {
                  setPaperSection('worldwire');
                  setSearchParams({ section: 'worldwire', scopeType: 'country', slug: 'united-states' }, { replace: true });
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  paperSection === 'worldwire'
                    ? 'bg-[#00652E] text-white'
                    : 'bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 text-[#00652E] dark:text-[#4ade80] border border-[#00652E]/30 hover:bg-[#00652E] hover:text-white'
                }`}
              >
                <Globe2 className="w-4 h-4" />
                {isHi ? 'वर्ल्डवायर · 50 देश (300/देश)' : 'WorldWire · 50 Countries (300/Country)'}
              </button>
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {isHi
                ? paperSection === 'our-pride'
                  ? '339 भारतीय शहरों के लिए प्रत्येक शहर के 300 विस्तृत स्थानीय समाचार'
                  : paperSection === 'beacon'
                    ? 'भारत एवं सभी 36 राज्यों/केंद्र शासित प्रदेशों के 300 विस्तृत समाचार'
                    : paperSection === 'worldwire'
                      ? 'विश्व के 50 देशों के लिए प्रत्येक देश के 300 अंतरराष्ट्रीय समाचार'
                      : 'राष्ट्रीय, अंतरराष्ट्रीय, शहर/राज्य, व्यापार एवं खेल का संपूर्ण हिंदी संस्करण'
                : paperSection === 'our-pride'
                  ? '300 detailed local reports per city across 339 Indian cities'
                  : paperSection === 'beacon'
                    ? '300 detailed national & state reports across India & 36 States/UTs'
                    : paperSection === 'worldwire'
                      ? '300 detailed international reports per country across 50 world nations'
                      : 'Complete multi-page national, international, Our Pride, business & sports broadsheet'}
            </span>
          </div>
        )}

        {paperSection !== 'broadsheet' ? (
          <DetailedWireEPaper
            deskMode={paperSection}
            paperTheme={paperTheme}
            setPaperTheme={setPaperTheme}
            viewMode={viewMode}
            setViewMode={setViewMode}
            zoom={zoom}
            setZoom={setZoom}
            fullscreen={fullscreen}
            setFullscreen={setFullscreen}
            initialScopeType={
              paperSection === 'our-pride'
                ? 'city'
                : paperSection === 'worldwire'
                  ? 'country'
                  : searchParams.get('scopeType') === 'state'
                    ? 'state'
                    : 'country'
            }
            initialSlug={
              paperSection === 'our-pride'
                ? searchParams.get('city') || searchParams.get('slug') || selectedLocalCity || 'mumbai'
                : paperSection === 'worldwire'
                  ? searchParams.get('slug') && searchParams.get('slug') !== 'india'
                    ? searchParams.get('slug') || 'united-states'
                    : 'united-states'
                  : searchParams.get('slug') || (searchParams.get('scopeType') === 'state' ? 'maharashtra' : 'india')
            }
            onSyncParams={(nextScopeType, nextSlug) => {
              const qp: Record<string, string> = {
                section: paperSection,
                scopeType: nextScopeType,
                slug: nextSlug,
              };
              if (nextScopeType === 'city') qp.city = nextSlug;
              setSearchParams(qp, { replace: true });
            }}
            broadsheetAd={broadsheetAd}
          />
        ) : (
          <>
        {/* Resume Last Read Page Banner */}
        {!fullscreen &&
          readerUser?.last_epaper_edition &&
          selectedEdition &&
          (readerUser.last_epaper_edition !== selectedEdition.edition_date ||
            (readerUser.last_epaper_page || 1) !== currentPageIdx + 1) && (
            <div className="p-3 rounded-lg bg-[#EAF5E5] dark:bg-[#00451F]/30 border border-[#00652E]/25 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
              <span className="text-neutral-800 dark:text-neutral-200">
                Continue reading from your last session: <strong>{readerUser.last_epaper_edition}</strong> · Page{' '}
                <strong>{readerUser.last_epaper_page}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  handleDateChange(readerUser.last_epaper_edition || '', readerUser.last_epaper_page || 1)
                }
                className="px-3 py-1 rounded bg-[#00652E] text-white font-semibold"
              >
                Resume Page {readerUser.last_epaper_page}
              </button>
            </div>
          )}

        {/* Newspaper Archive Search */}
        {!fullscreen && (
          <div className="space-y-3 no-print">
            <form onSubmit={runArchiveSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="search"
                  value={archiveQuery}
                  onChange={(e) => setArchiveQuery(e.target.value)}
                  placeholder="Search inside all newspaper editions (headline, topic, or state)..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <button
                type="submit"
                disabled={searchingArchive}
                className="px-4 py-2 rounded-md bg-[#00652E] text-white text-xs font-semibold whitespace-nowrap"
              >
                {searchingArchive ? 'Searching...' : 'Search Editions'}
              </button>
              {showArchiveResults && (
                <button
                  type="button"
                  onClick={() => setShowArchiveResults(false)}
                  className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
                >
                  Close Results
                </button>
              )}
            </form>

            {showArchiveResults && (
              <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 max-h-64 overflow-y-auto">
                <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                  Archive Search Matches ({archiveHits.length})
                </div>
                {archiveHits.length === 0 ? (
                  <p className="text-xs text-neutral-500">No stories matched &quot;{archiveQuery}&quot; inside stored editions.</p>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {archiveHits.map((hit, idx) => (
                      <button
                        key={`${hit.edition_date}-${hit.pageNumber}-${idx}`}
                        type="button"
                        onClick={() => {
                          handleDateChange(hit.edition_date, hit.pageNumber);
                          setShowArchiveResults(false);
                        }}
                        className="w-full text-left py-2 hover:text-[#00652E] flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-semibold truncate">{hit.title}</span>
                        <span className="font-mono-tabular text-neutral-500 shrink-0">
                          {hit.edition_date} · Page {hit.pageNumber} ({hit.sectionTitle})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!fullscreen && <AdSlot placement="epaper_banner" />}

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">
            {isHi ? 'हिंदी ई-पेपर संस्करण तैयार हो रहा है...' : 'Loading digital editions...'}
          </div>
        ) : !selectedEdition || !activePage ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
            <p className="text-base font-medium">No editions published for the selected archive filter.</p>
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter('')}
                className="mt-3 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
              >
                Show All Archive Editions
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Sidebar: Pages + Clickable Newspaper Index + Previous Editions */}
            {!fullscreen && (
              <aside className="lg:col-span-3 space-y-4 no-print">
                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                    {isHi ? `संस्करण पृष्ठ (${pages.length})` : `Edition Pages (${pages.length})`}
                  </h2>
                  <div className="space-y-1.5">
                    {pages.map((p, idx) => (
                      <button
                        key={p.pageNumber}
                        type="button"
                        onClick={() => setCurrentPageIdx(idx)}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between gap-2 ${
                          idx === currentPageIdx
                            ? 'bg-[#00652E] text-white font-semibold'
                            : 'hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <span className="truncate">{p.sectionTitle}</span>
                        <span className="font-mono-tabular shrink-0">P.{p.pageNumber}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaperSection('beacon');
                        setSearchParams({ section: 'beacon', scopeType: 'country', slug: 'india' }, { replace: true });
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] text-xs font-semibold hover:bg-[#00652E] hover:text-white transition-colors"
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      The Beacon · 300/State →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const city = selectedLocalCity || 'mumbai';
                        setPaperSection('our-pride');
                        setSearchParams(
                          { section: 'our-pride', scopeType: 'city', slug: city, city },
                          { replace: true },
                        );
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] text-xs font-semibold hover:bg-[#00652E] hover:text-white transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Our Pride · 300/City →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaperSection('worldwire');
                        setSearchParams(
                          { section: 'worldwire', scopeType: 'country', slug: 'united-states' },
                          { replace: true },
                        );
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] text-xs font-semibold hover:bg-[#00652E] hover:text-white transition-colors"
                    >
                      <Globe2 className="w-3.5 h-3.5" />
                      WorldWire · 300/Country →
                    </button>
                  </div>
                </div>

                {/* Clickable Newspaper Index */}
                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                    Clickable Edition Index
                  </h2>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {clickableIndex.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentPageIdx(item.pageIdx)}
                        className="w-full text-left text-xs pb-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:text-[#00652E] transition-colors"
                      >
                        <div className="text-[10px] font-mono-tabular text-[#00652E] dark:text-[#4ade80]">
                          P.{item.pageNumber} · {item.sectionTitle}
                        </div>
                        <div className="font-medium line-clamp-2 mt-0.5">{item.title}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                    Previous Editions
                  </h2>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {editions.map((ed) => (
                      <button
                        key={ed.id}
                        type="button"
                        onClick={() => handleDateChange(ed.edition_date)}
                        className={`w-full text-left p-2.5 rounded border text-xs transition-colors ${
                          ed.id === selectedEdition.id
                            ? 'border-[#00652E] bg-[#EAF5E5]/60 dark:bg-[#00451F]/30'
                            : 'border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/40'
                        }`}
                      >
                        <div className="font-mono-tabular font-semibold text-neutral-900 dark:text-neutral-100">
                          {ed.edition_date}
                        </div>
                        <div className="text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {ed.page_count} Pages · {ed.article_count} Detailed Stories
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            )}

            {/* Reader Canvas */}
            <div className={`${fullscreen ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-4`}>
              {/* Smart Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-100 dark:bg-neutral-900 px-4 py-2.5 rounded-lg no-print">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPageIdx === 0}
                    onClick={() => setCurrentPageIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40 hover:text-[#00652E]"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <select
                    aria-label="Jump directly to page"
                    value={currentPageIdx}
                    onChange={(e) => setCurrentPageIdx(Number(e.target.value) || 0)}
                    className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs font-mono-tabular font-semibold"
                  >
                    {pages.map((p, idx) => (
                      <option key={p.pageNumber} value={idx}>
                        Page {p.pageNumber} / {pages.length} · {p.sectionTitle}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] font-mono-tabular text-neutral-500 hidden sm:inline">
                    {selectedEdition.edition_date}
                  </span>
                  {translatingPage && (
                    <span className="text-[11px] font-semibold text-[#00652E] dark:text-[#4ade80]">
                      {isHi ? 'पृष्ठ अनुवाद हो रहा है...' : 'Translating page...'}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={currentPageIdx >= pages.length - 1}
                    onClick={() => setCurrentPageIdx((i) => Math.min(pages.length - 1, i + 1))}
                    className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40 hover:text-[#00652E]"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* View Mode: Broadsheet vs Article Mode */}
                  <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950">
                    <button
                      type="button"
                      onClick={() => setViewMode('broadsheet')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 font-semibold ${
                        viewMode === 'broadsheet' ? 'bg-[#00652E] text-white' : ''
                      }`}
                    >
                      <BookOpen className="w-3 h-3" /> Page
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('article')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 font-semibold ${
                        viewMode === 'article' ? 'bg-[#00652E] text-white' : ''
                      }`}
                    >
                      <FileText className="w-3 h-3" /> Article Mode
                    </button>
                  </div>

                  {/* Type Comfort Scale (A- / A / A+) */}
                  <div
                    className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950"
                    role="group"
                    aria-label="Reading font size"
                  >
                    {(
                      [
                        { id: 'compact', label: 'A-' },
                        { id: 'standard', label: 'A' },
                        { id: 'large', label: 'A+' },
                      ] as const
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setTextScale(sz.id)}
                        className={`px-2 py-1 font-semibold whitespace-nowrap ${
                          textScale === sz.id ? 'bg-[#00652E] text-white' : ''
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>

                  {/* Personal Paper Theme */}
                  <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950">
                    {(['light', 'sepia', 'dark'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPaperTheme(t)}
                        className={`px-2 py-1 font-semibold capitalize whitespace-nowrap ${
                          paperTheme === t ? 'bg-[#00652E] text-white' : ''
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Audio Narration */}
                  <button
                    type="button"
                    onClick={togglePageSpeech}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-semibold whitespace-nowrap ${
                      speakingTarget === 'page'
                        ? 'bg-[#00652E] text-white border-[#00652E]'
                        : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 hover:border-[#00652E]'
                    }`}
                  >
                    {speakingTarget === 'page' ? (
                      <>
                        <Square className="w-3 h-3" /> Stop Audio
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" /> Listen Page
                      </>
                    )}
                  </button>

                  {/* Zoom Controls */}
                  {viewMode === 'broadsheet' && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono-tabular">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(75, z - 15))}
                        aria-label="Zoom out"
                        className="hover:text-[#00652E]"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-1">{zoom}%</span>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(130, z + 15))}
                        aria-label="Zoom in"
                        className="hover:text-[#00652E]"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={bookmarkCurrentPage}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-semibold whitespace-nowrap ${
                      pageSaved
                        ? 'bg-[#00652E] text-white border-[#00652E]'
                        : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950'
                    }`}
                  >
                    <Bookmark className="w-3 h-3" />
                    {pageSaved ? 'Page Saved' : 'Bookmark Page'}
                  </button>

                  <button
                    type="button"
                    onClick={shareCurrentEdition}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold whitespace-nowrap hover:border-[#00652E]"
                    title="Share this E-Paper page"
                  >
                    {sharedLinkNotice ? <Check className="w-3 h-3 text-[#00652E]" /> : <Share2 className="w-3 h-3" />}
                    {sharedLinkNotice ? 'Link Copied' : 'Share'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFullscreen((f) => !f)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold whitespace-nowrap"
                    title="Distraction-free fullscreen reading (F)"
                  >
                    {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    {fullscreen ? 'Exit Focus' : 'Focus'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShortcutsOpen((v) => !v)}
                    aria-label="Toggle keyboard shortcuts"
                    title="Keyboard Shortcuts (?)"
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold whitespace-nowrap ${
                      shortcutsOpen
                        ? 'bg-[#00652E] text-white border-[#00652E]'
                        : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {shortcutsOpen && (
                <div className="px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-300 no-print">
                  <div className="flex flex-wrap items-center gap-4">
                    <span><strong className="font-mono-tabular">← / →</strong> Flip Page</span>
                    <span><strong className="font-mono-tabular">T</strong> Theme (Light/Sepia/Dark)</span>
                    <span><strong className="font-mono-tabular">F</strong> Focus Mode</span>
                    <span><strong className="font-mono-tabular">Ctrl+K</strong> Quick Jump Anywhere</span>
                    <span><strong className="font-mono-tabular">Esc</strong> Exit Focus</span>
                  </div>
                  <button type="button" onClick={() => setShortcutsOpen(false)} className="text-[#00652E] font-semibold hover:underline">
                    Hide
                  </button>
                </div>
              )}

              {/* Thin Edition Progress Strip */}
              <div className="h-[2px] w-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden rounded-full no-print">
                <div
                  className="h-full bg-[#00652E] dark:bg-[#4ade80] transition-all duration-300"
                  style={{ width: `${((currentPageIdx + 1) / Math.max(1, pages.length)) * 100}%` }}
                />
              </div>

              {/* Clean Article Reader Mode vs Broadsheet Sheet */}
              {viewMode === 'article' ? (
                <div className={`rounded-lg border p-6 sm:p-10 space-y-6 ${sheetClass}`}>
                  <div className="border-b border-current/15 pb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
                    <span>
                      Clean Article Mode · {activePage.sectionTitle} · {selectedEdition.edition_date}
                    </span>
                    <span>
                      Page {activePage.pageNumber} of {pages.length} · {activePage.articles.length} Detailed Reports
                    </span>
                  </div>

                  {broadsheetAd && <BroadsheetSponsorBox ad={broadsheetAd} paperTheme={paperTheme} />}

                  <div className="max-w-2xl mx-auto space-y-8">
                    {activePage.articles.map((art, idx) => {
                      const { standfirst, paragraphs, readMins } = getDetailedStoryBody(art.summary, art.content);
                      const timeLabel = formatIndiaDateTime(art.published_at);
                      const metaParts = [
                        art.category_name || 'News',
                        art.city_name ? art.city_name.replace(' (town)', '') : '',
                        art.state_name || '',
                        art.subtopic || '',
                        art.source_name || 'Maheep Desk',
                      ].filter(Boolean);

                      return (
                        <article key={idx} className="pb-8 border-b border-current/15 last:border-0 space-y-3">
                          <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                            {metaParts.join(' · ')}
                          </div>
                          {art.slug ? (
                            <Link
                              to={`/news/${art.slug}`}
                              className="font-editorial text-2xl sm:text-3xl font-bold hover:text-[#00652E] block leading-tight"
                            >
                              {art.title}
                            </Link>
                          ) : (
                            <h3 className="font-editorial text-2xl sm:text-3xl font-bold leading-tight">{art.title}</h3>
                          )}
                          <div className="text-xs opacity-70 font-mono-tabular">
                            By {art.author || 'Editorial Desk'}
                            {timeLabel ? ` · ${timeLabel}` : ''} · {readMins} min read
                          </div>
                          {art.image_url && (
                            <figure className="space-y-1">
                              <div className="aspect-[16/9] rounded overflow-hidden bg-neutral-100">
                                <ArticleImage
                                  src={art.image_url}
                                  alt={art.title}
                                  category={art.category_name}
                                  sourceName={art.source_name}
                                  imageRights={art.image_rights}
                                />
                              </div>
                              {art.image_rights && (
                                <figcaption className="text-[11px] opacity-65 italic">{art.image_rights}</figcaption>
                              )}
                            </figure>
                          )}
                          {standfirst && (
                            <p className="text-base font-semibold leading-relaxed opacity-95">{standfirst}</p>
                          )}
                          <div className={`space-y-3 opacity-90 ${articleScaleClass}`}>
                            {paragraphs.map((para, pIdx) => (
                              <p key={pIdx}>{para}</p>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2">
                            <div className="flex flex-wrap items-center gap-3">
                              {art.source_url && (
                                <a
                                  href={art.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold opacity-75 hover:opacity-100 hover:underline"
                                >
                                  Original Source ({art.source_name}) <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleStorySpeech(`art-${idx}`, art.title, art.summary)}
                                className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 text-[#00652E] dark:text-[#4ade80] whitespace-nowrap"
                              >
                                {speakingTarget === `art-${idx}` ? (
                                  <>
                                    <Square className="w-3 h-3" /> Stop
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3.5 h-3.5" /> Listen
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyStoryClip(`art-${idx}`, art)}
                                className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 hover:text-[#00652E] whitespace-nowrap"
                              >
                                {copiedKey === `art-${idx}` ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-[#00652E]" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" /> Copy Clip
                                  </>
                                )}
                              </button>
                            </div>
                            {art.slug && (
                              <Link to={`/news/${art.slug}`} className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline ml-auto whitespace-nowrap">
                                Open Full Interactive Report →
                              </Link>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div
                    key={`${selectedEdition.id}-p${activePage.pageNumber}`}
                    style={{
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top center',
                    }}
                    className={`epaper-print-page border rounded-lg p-6 sm:p-10 shadow-sm transition-transform ${sheetClass}`}
                  >
                    <div className="border-b-2 border-[#00652E] pb-1 mb-5">
                      <div className="border-b border-current/20 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                        <div>
                          <div className="font-editorial text-2xl sm:text-3xl font-extrabold text-[#00652E] dark:text-[#4ade80] tracking-tight">
                            {isHi ? 'महीप न्यूज़ पोर्टल · हिंदी संस्करण' : 'MAHEEP NEWS PORTAL'}
                          </div>
                          <p className="text-xs opacity-75">
                            {isHi
                              ? 'सच के साथ, जनता के विश्वास के साथ · भारत और विश्व के समाचार · विस्तृत ब्रॉडशीट संस्करण'
                              : 'सच के साथ, जनता के विश्वास के साथ · News from India & Beyond · Detailed Broadsheet Edition'}
                          </p>
                        </div>
                        <div className="text-left sm:text-right text-xs font-mono-tabular opacity-85">
                          <div className="font-semibold">{activePage.sectionTitle}</div>
                          <div>
                            {isHi
                              ? `संस्करण: ${selectedEdition.edition_date} · पृष्ठ ${activePage.pageNumber} / ${pages.length} · ${activePage.articles.length} समाचार`
                              : `Edition: ${selectedEdition.edition_date} · Page ${activePage.pageNumber} of ${pages.length} · ${activePage.articles.length} Stories`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Broadsheet Page Ad (Front Page Top / Inner Pages) */}
                    {broadsheetAd && (
                      <div className="mb-6">
                        <BroadsheetSponsorBox ad={broadsheetAd} paperTheme={paperTheme} />
                      </div>
                    )}

                    {/* Newspaper Detailed Multi-Column Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                      {activePage.articles.map((art, idx) => {
                        const { standfirst, paragraphs, wordCount, readMins } = getDetailedStoryBody(
                          art.summary,
                          art.content,
                        );
                        const timeLabel = formatIndiaDateTime(art.published_at);
                        const isLead = idx === 0;
                        const metaParts = [
                          art.category_name || 'News',
                          art.city_name ? art.city_name.replace(' (town)', '') : '',
                          art.state_name || '',
                          art.subtopic || '',
                          art.source_name || 'Maheep Desk',
                        ].filter(Boolean);

                        return (
                          <article
                            key={`${art.title}-${idx}`}
                            className={`pb-6 border-b border-current/15 ${isLead ? 'md:col-span-2' : ''}`}
                          >
                            <div className="text-[11px] font-bold uppercase tracking-wide text-[#00652E] dark:text-[#4ade80] mb-1">
                              {metaParts.join(' · ')}
                            </div>

                            <div className={isLead ? 'grid grid-cols-1 md:grid-cols-12 gap-5 items-start' : 'space-y-3'}>
                              {isLead && art.image_url && (
                                <figure className="md:col-span-5 space-y-1">
                                  <div className="aspect-[4/3] rounded overflow-hidden bg-neutral-100">
                                    <ArticleImage
                                      src={art.image_url}
                                      alt={art.title}
                                      category={art.category_name}
                                      sourceName={art.source_name}
                                      imageRights={art.image_rights}
                                    />
                                  </div>
                                  {art.image_rights && (
                                    <figcaption className="text-[10px] opacity-65 italic">{art.image_rights}</figcaption>
                                  )}
                                </figure>
                              )}

                              <div className={isLead && art.image_url ? 'md:col-span-7 space-y-2.5' : 'space-y-2.5'}>
                                {art.slug ? (
                                  <Link
                                    to={`/news/${art.slug}`}
                                    className={`font-editorial font-bold hover:text-[#00652E] block leading-snug ${
                                      isLead ? 'text-2xl sm:text-[26px]' : 'text-lg sm:text-xl'
                                    }`}
                                  >
                                    {art.title}
                                  </Link>
                                ) : (
                                  <h3
                                    className={`font-editorial font-bold leading-snug ${
                                      isLead ? 'text-2xl sm:text-[26px]' : 'text-lg sm:text-xl'
                                    }`}
                                  >
                                    {art.title}
                                  </h3>
                                )}

                                <div className="text-[11px] opacity-70 font-mono-tabular">
                                  By {art.author || 'Editorial Desk'}
                                  {timeLabel ? ` · ${timeLabel}` : ''} · {wordCount} words ({readMins} min read)
                                </div>

                                {!isLead && idx <= 2 && art.image_url && (
                                  <figure className="space-y-1 my-2">
                                    <div className="aspect-[16/9] rounded overflow-hidden bg-neutral-100">
                                      <ArticleImage
                                        src={art.image_url}
                                        alt={art.title}
                                        category={art.category_name}
                                        sourceName={art.source_name}
                                        imageRights={art.image_rights}
                                      />
                                    </div>
                                    {art.image_rights && (
                                      <figcaption className="text-[10px] opacity-65 italic">
                                        {art.image_rights}
                                      </figcaption>
                                    )}
                                  </figure>
                                )}

                                {standfirst && (
                                  <p className="text-sm font-semibold opacity-95 leading-relaxed">{standfirst}</p>
                                )}

                                <div className={`space-y-2.5 opacity-90 text-justify ${bodyScaleClass}`}>
                                  {paragraphs.map((para, pIdx) => (
                                    <p
                                      key={pIdx}
                                      className={
                                        isLead && pIdx === 0
                                          ? 'first-letter:float-left first-letter:font-editorial first-letter:text-4xl first-letter:font-bold first-letter:mr-2 first-letter:leading-none first-letter:text-[#00652E]'
                                          : ''
                                      }
                                    >
                                      {para}
                                    </p>
                                  ))}
                                </div>

                                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
                                  <div className="flex flex-wrap items-center gap-3">
                                    {art.source_url ? (
                                      <a
                                        href={art.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 opacity-75 hover:opacity-100 hover:underline font-medium"
                                      >
                                        Source: {art.source_name} <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="opacity-65">Maheep Bureau Dispatch</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleStorySpeech(`sheet-${idx}`, art.title, art.summary)}
                                      className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 text-[#00652E] dark:text-[#4ade80] whitespace-nowrap"
                                    >
                                      {speakingTarget === `sheet-${idx}` ? (
                                        <>
                                          <Square className="w-3 h-3" /> Stop
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 className="w-3.5 h-3.5" /> Listen
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => copyStoryClip(`sheet-${idx}`, art)}
                                      className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 hover:text-[#00652E] whitespace-nowrap"
                                    >
                                      {copiedKey === `sheet-${idx}` ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-[#00652E]" /> Copied
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" /> Copy Clip
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  {art.slug && (
                                    <Link
                                      to={`/news/${art.slug}`}
                                      className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
                                    >
                                      Read Full Story →
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="mt-6 pt-3 border-t border-current/15 flex items-center justify-between text-xs opacity-65 font-mono-tabular">
                      <span>Maheep News Portal · Detailed Digital Newspaper Edition</span>
                      <span>
                        Page {activePage.pageNumber} of {pages.length}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Page Thumbnail Navigation Strip */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-print">
                {pages.map((p, idx) => (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => setCurrentPageIdx(idx)}
                    className={`shrink-0 w-32 p-2.5 rounded border text-left transition-colors ${
                      idx === currentPageIdx
                        ? 'border-[#00652E] bg-[#EAF5E5] dark:bg-[#00451F]/40'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-[#00652E]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono-tabular font-bold text-[#00652E] dark:text-[#4ade80]">
                      <span>PAGE {p.pageNumber}</span>
                      <span>{p.articles.length} stories</span>
                    </div>
                    <div className="text-[11px] font-semibold truncate mt-1">{p.sectionTitle}</div>
                    <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                      {p.articles[0]?.title || 'Edition page'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {!fullscreen && (
          <div className="no-print">
            <AeoFaqSection />
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
