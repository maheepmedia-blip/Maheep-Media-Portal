import {
  BookOpen,
  Calendar,
  Check,
  CloudSun,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  Search,
  Square,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.tsx';
import type { Advertisement, Article, CityItem } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';
import { speakNewspaperText, stopNewspaperSpeech } from '../utils/speech.ts';
import { ArticleImage } from './ArticleImage.tsx';
import { OurPrideCityLocationMap } from './IndiaGoogleNewsMap.tsx';

type PaperTheme = 'light' | 'sepia' | 'dark';
type ReaderViewMode = 'broadsheet' | 'article';
type TextScale = 'compact' | 'standard' | 'large';

const QUICK_JUMP_CITIES = [
  { slug: 'mumbai', label: 'Mumbai' },
  { slug: 'delhi', label: 'Delhi' },
  { slug: 'bengaluru', label: 'Bengaluru' },
  { slug: 'hyderabad', label: 'Hyderabad' },
  { slug: 'chennai', label: 'Chennai' },
  { slug: 'kolkata', label: 'Kolkata' },
  { slug: 'pune', label: 'Pune' },
  { slug: 'jaipur', label: 'Jaipur' },
  { slug: 'lucknow', label: 'Lucknow' },
  { slug: 'patna', label: 'Patna' },
  { slug: 'bhopal', label: 'Bhopal' },
];

interface OurPridePayload {
  city: CityItem;
  date: string;
  todayIst: string;
  yesterdayIst: string;
  wireStatus: { fetched: number; inserted: number; cached?: boolean; error?: string } | null;
  cityArticles: Article[];
  recentCityArticles: Article[];
  stateArticles: Article[];
  availableDates: Array<{ date: string; count: number }>;
}

interface CityWeatherSummary {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}

interface OurPrideCityEPaperProps {
  paperTheme: PaperTheme;
  setPaperTheme: (theme: PaperTheme) => void;
  viewMode: ReaderViewMode;
  setViewMode: (mode: ReaderViewMode) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  fullscreen: boolean;
  setFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  initialCitySlug: string;
  initialDate: string;
  onSyncParams: (citySlug: string, date: string) => void;
  broadsheetAd: Advertisement | null;
}

function getStoryParagraphs(summary: string, content?: string) {
  const cleanSummary = (summary || '').trim();
  const cleanContent = (content || '').trim();
  if (!cleanContent || cleanContent === cleanSummary) {
    return {
      standfirst: '',
      paragraphs: cleanSummary ? cleanSummary.split(/\n+/).map((p) => p.trim()).filter(Boolean) : [],
    };
  }
  const paragraphs = cleanContent.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const startsWithSummary =
    cleanSummary.length > 20 &&
    paragraphs.length > 0 &&
    paragraphs[0].toLowerCase().startsWith(cleanSummary.slice(0, 40).toLowerCase());
  return {
    standfirst: startsWithSummary ? '' : cleanSummary,
    paragraphs,
  };
}

function formatIndianPopulation(num: number | null | undefined): string {
  if (num === null || num === undefined || !Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN').format(num);
}

function formatCoord(val: number, posLabel: string, negLabel: string): string {
  const abs = Math.abs(val).toFixed(4);
  return `${abs}°${val >= 0 ? posLabel : negLabel}`;
}

export function OurPrideCityEPaper({
  paperTheme,
  setPaperTheme,
  viewMode,
  setViewMode,
  zoom,
  setZoom,
  fullscreen,
  setFullscreen,
  initialCitySlug,
  initialDate,
  onSyncParams,
  broadsheetAd,
}: OurPrideCityEPaperProps) {
  const { language } = usePortal();

  const [cities, setCities] = useState<CityItem[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [citySearch, setCitySearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string>(initialCitySlug || 'mumbai');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || '');

  const [editionData, setEditionData] = useState<OurPridePayload | null>(null);
  const [loadingEdition, setLoadingEdition] = useState(true);
  const [refreshingWire, setRefreshingWire] = useState(false);
  const [weather, setWeather] = useState<CityWeatherSummary | null>(null);
  const [textScale, setTextScale] = useState<TextScale>('standard');
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCityMap, setShowCityMap] = useState(false);

  // Sync external URL params if user navigates directly
  useEffect(() => {
    if (initialCitySlug && initialCitySlug !== selectedSlug) {
      setSelectedSlug(initialCitySlug);
    }
  }, [initialCitySlug]);

  useEffect(() => {
    if (initialDate && initialDate !== selectedDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    let active = true;
    setLoadingCities(true);
    fetch('/api/cities?limit=400', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        const list = (json.cities || []) as CityItem[];
        setCities(list);
        if (list.length > 0 && !list.some((c) => c.slug === selectedSlug)) {
          setSelectedSlug(list[0].slug);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadCityEdition = (slug: string, dateVal: string, refresh = false) => {
    if (!slug) return;
    if (refresh) {
      setRefreshingWire(true);
    } else {
      setLoadingEdition(true);
    }

    const params = new URLSearchParams();
    if (dateVal) params.set('date', dateVal);
    if (language === 'en' || language === 'hi') params.set('lang', language);
    if (refresh) params.set('refresh', '1');

    fetch(`/api/cities/${encodeURIComponent(slug)}/our-pride?${params.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: OurPridePayload | null) => {
        if (!json) return;
        setEditionData(json);
        if (!dateVal && json.date) {
          setSelectedDate(json.date);
        }
        onSyncParams(slug, dateVal || json.date);
      })
      .catch(() => {})
      .finally(() => {
        setLoadingEdition(false);
        setRefreshingWire(false);
      });
  };

  useEffect(() => {
    loadCityEdition(selectedSlug, selectedDate, false);
  }, [selectedSlug, selectedDate, language]);

  // Fetch live Open-Meteo weather for the chosen city's coordinates
  useEffect(() => {
    const city = editionData?.city;
    if (!city) return;
    let active = true;
    setWeather(null);
    fetch(`/api/weather?lat=${encodeURIComponent(String(city.lat))}&lon=${encodeURIComponent(String(city.lon))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.current) {
          setWeather({
            temperature: Number(json.current.temperature ?? 0),
            condition: String(json.current.condition || ''),
            humidity: Number(json.current.humidity ?? 0),
            windSpeed: Number(json.current.windSpeed ?? 0),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [editionData?.city?.slug]);

  const stateOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cities) {
      if (c.state_name && !map.has(c.state_name)) {
        map.set(c.state_name, c.state_slug || c.state_name);
      }
    }
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  }, [cities]);

  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    return cities.filter((c) => {
      if (stateFilter && c.state_name !== stateFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.state_name.toLowerCase().includes(q) ||
        String(c.rank).includes(q)
      );
    });
  }, [cities, citySearch, stateFilter]);

  useEffect(() => {
    stopNewspaperSpeech();
    setSpeakingTarget(null);
  }, [selectedSlug, selectedDate]);

  useEffect(() => {
    return () => {
      stopNewspaperSpeech();
    };
  }, []);

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

  const activeCity = editionData?.city || cities.find((c) => c.slug === selectedSlug) || null;
  const activeDate = editionData?.date || selectedDate || '';
  const todayIst =
    editionData?.todayIst || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const yesterdayIst =
    editionData?.yesterdayIst ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86_400_000));

  const cityArticles = editionData?.cityArticles || [];
  const recentCityArticles = editionData?.recentCityArticles || [];
  const stateArticles = editionData?.stateArticles || [];

  const toggleEditionSpeech = () => {
    const combined = [...cityArticles, ...recentCityArticles, ...stateArticles].slice(0, 6);
    if (combined.length === 0) return;
    if (speakingTarget === 'edition') {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    const cityLabel = activeCity ? activeCity.name.replace(' (town)', '') : 'City';
    const transcript = combined
      .map((art, i) => `Report ${i + 1}. ${art.title}. ${art.summary || ''}`)
      .join(' ');
    speakNewspaperText(`Our Pride, ${cityLabel}. ${transcript}`, {
      onStart: () => setSpeakingTarget('edition'),
      onEnd: () => setSpeakingTarget((curr) => (curr === 'edition' ? null : curr)),
    });
  };

  const toggleStorySpeech = (key: string, title: string, summary: string) => {
    if (speakingTarget === key) {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    speakNewspaperText(`${title}. ${summary || ''}`, {
      onStart: () => setSpeakingTarget(key),
      onEnd: () => setSpeakingTarget((curr) => (curr === key ? null : curr)),
    });
  };

  const copyStoryClip = async (key: string, art: Article) => {
    const shareUrl = `${window.location.origin}/news/${art.slug}`;
    const cityLabel = (art.city_name || activeCity?.name || '').replace(' (town)', '');
    const clipText = `${art.title}\n\n${art.summary}\n\n— Our Pride · ${cityLabel} (${activeDate})\n${shareUrl}`;
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

  const renderBroadsheetArticle = (art: Article, isLead: boolean, idx: number) => {
    const { standfirst, paragraphs } = getStoryParagraphs(art.summary, art.content);
    const timeLabel = formatIndiaDateTime(art.published_at);
    const metaParts = [
      'Our Pride',
      art.city_name ? art.city_name.replace(' (town)', '') : activeCity?.name.replace(' (town)', '') || '',
      art.state_name || activeCity?.state_name || '',
      art.source_name || 'Maheep City Desk',
    ].filter(Boolean);

    return (
      <article
        key={`${art.id}-${idx}`}
        className={`pb-5 border-b border-current/15 ${isLead ? 'md:col-span-2' : ''}`}
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#00652E] dark:text-[#4ade80] mb-1">
          {metaParts.join(' · ')}
        </div>

        <div className={isLead && art.image_url ? 'grid grid-cols-1 md:grid-cols-12 gap-5 items-start' : 'space-y-2'}>
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
              {art.image_rights && <figcaption className="text-[10px] opacity-65 italic">{art.image_rights}</figcaption>}
            </figure>
          )}

          <div className={isLead && art.image_url ? 'md:col-span-7 space-y-2' : 'space-y-2'}>
            <Link
              to={`/news/${art.slug}`}
              className={`font-editorial font-bold hover:text-[#00652E] block leading-snug ${
                isLead ? 'text-2xl sm:text-[26px]' : 'text-lg sm:text-xl'
              }`}
            >
              {art.title}
            </Link>

            <div className="text-[11px] opacity-70 font-mono-tabular">
              By {art.author || 'City Correspondent'}
              {timeLabel ? ` · ${timeLabel}` : ''}
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
                  <figcaption className="text-[10px] opacity-65 italic">{art.image_rights}</figcaption>
                )}
              </figure>
            )}

            {standfirst && <p className="text-sm font-semibold opacity-95 leading-relaxed">{standfirst}</p>}

            <div className={`space-y-2 opacity-90 text-justify ${bodyScaleClass}`}>
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
                  <span className="opacity-65">Maheep Local Bureau</span>
                )}
                <button
                  type="button"
                  onClick={() => toggleStorySpeech(`city-${art.id}-${idx}`, art.title, art.summary)}
                  className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 text-[#00652E] dark:text-[#4ade80] whitespace-nowrap"
                >
                  {speakingTarget === `city-${art.id}-${idx}` ? (
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
                  onClick={() => copyStoryClip(`city-${art.id}-${idx}`, art)}
                  className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 hover:text-[#00652E] whitespace-nowrap"
                >
                  {copiedKey === `city-${art.id}-${idx}` ? (
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
              <Link
                to={`/news/${art.slug}`}
                className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
              >
                Read Full Story →
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Sidebar: 339-City Directory & City Archive Dates */}
      {!fullscreen && (
        <aside className="lg:col-span-3 space-y-4 no-print">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 space-y-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80]">
                Our Pride · City Editions ({cities.length})
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Pick any Indian city for daily local broadsheet dispatches.
              </p>
            </div>

            <div className="relative">
              <input
                type="search"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder="Search city or state..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <select
              aria-label="Filter cities by State or Union Territory"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="">All States &amp; UTs ({stateOptions.length})</option>
              {stateOptions.map((stName) => (
                <option key={stName} value={stName}>
                  {stName}
                </option>
              ))}
            </select>

            <div className="text-[11px] font-mono-tabular text-neutral-500">
              Showing {filteredCities.length} of {cities.length} cities
            </div>

            {loadingCities ? (
              <p className="text-xs text-neutral-500 py-4">Loading Indian cities directory...</p>
            ) : (
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {filteredCities.map((c) => {
                  const active = c.slug === selectedSlug;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedSlug(c.slug)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors border ${
                        active
                          ? 'bg-[#00652E] text-white border-[#00652E] font-semibold'
                          : 'border-transparent hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className={`font-mono-tabular mr-1.5 ${active ? 'text-[#EAF5E5]' : 'text-neutral-400'}`}>
                            #{c.rank}
                          </span>
                          {c.name.replace(' (town)', '')}
                          {Boolean(c.is_capital) && (
                            <span title="State / UT Capital" className="ml-1">
                              ‡
                            </span>
                          )}
                        </span>
                        {Number(c.article_count || 0) > 0 && (
                          <span className={`font-mono-tabular text-[10px] shrink-0 ${active ? 'text-[#EAF5E5]' : 'text-[#00652E] dark:text-[#4ade80]'}`}>
                            {c.article_count}
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] mt-0.5 flex items-center justify-between ${active ? 'text-[#EAF5E5]' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        <span className="truncate">{c.state_name}</span>
                        <span className="font-mono-tabular shrink-0">{formatIndianPopulation(c.census_2011)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {editionData && editionData.availableDates.length > 0 && (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                Recent Local Dates
              </h2>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {editionData.availableDates.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDate(d.date)}
                    className={`w-full text-left px-2.5 py-1.5 rounded border text-xs flex items-center justify-between transition-colors ${
                      d.date === activeDate
                        ? 'border-[#00652E] bg-[#EAF5E5]/60 dark:bg-[#00451F]/30 font-semibold'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/50'
                    }`}
                  >
                    <span className="font-mono-tabular">{d.date}</span>
                    <span className="font-mono-tabular text-neutral-500">{d.count} reports</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Main Reader Canvas */}
      <div className={`${fullscreen ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-4`}>
        {/* City & Date Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-100 dark:bg-neutral-900 px-4 py-2.5 rounded-lg no-print">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedDate(todayIst)}
                className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                  activeDate === todayIst ? 'bg-[#00652E] text-white font-semibold' : ''
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayIst)}
                className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                  activeDate === yesterdayIst ? 'bg-[#00652E] text-white font-semibold' : ''
                }`}
              >
                Yesterday
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" />
              <input
                type="date"
                aria-label="Select Our Pride local edition date"
                value={activeDate}
                max={todayIst}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono-tabular text-xs"
              />
            </label>

            <button
              type="button"
              disabled={refreshingWire || !selectedSlug}
              onClick={() => loadCityEdition(selectedSlug, activeDate, true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00652E] hover:bg-[#00451F] text-white font-semibold disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingWire ? 'animate-spin' : ''}`} />
              {refreshingWire ? 'Fetching Local Wire...' : 'Refresh City Wire'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
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

            <button
              type="button"
              onClick={toggleEditionSpeech}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-semibold whitespace-nowrap ${
                speakingTarget === 'edition'
                  ? 'bg-[#00652E] text-white border-[#00652E]'
                  : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 hover:border-[#00652E]'
              }`}
            >
              {speakingTarget === 'edition' ? (
                <>
                  <Square className="w-3 h-3" /> Stop Audio
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" /> Listen Edition
                </>
              )}
            </button>

            {viewMode === 'broadsheet' && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono-tabular">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(75, z - 15))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1">{zoom}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(130, z + 15))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>

            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold whitespace-nowrap"
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {fullscreen ? 'Exit Focus' : 'Focus'}
            </button>
          </div>
        </div>

        {/* Unboxed Major Cities Quick-Jump Bar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border-b border-neutral-200 dark:border-neutral-800 pb-2.5 no-print">
          <span className="font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mr-1">
            Quick Switch:
          </span>
          {QUICK_JUMP_CITIES.map((qc, idx) => {
            const isCurrent = qc.slug === selectedSlug;
            return (
              <React.Fragment key={qc.slug}>
                {idx > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
                <button
                  type="button"
                  onClick={() => setSelectedSlug(qc.slug)}
                  className={`whitespace-nowrap transition-colors ${
                    isCurrent
                      ? 'font-bold text-[#00652E] dark:text-[#4ade80] underline underline-offset-4'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-[#00652E] dark:hover:text-[#4ade80]'
                  }`}
                >
                  {qc.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Broadsheet Paper Canvas */}
        {loadingEdition && !editionData ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-500">
            Loading Our Pride city broadsheet...
          </div>
        ) : !activeCity ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-500">
            Select a city from the directory to open its Our Pride local broadsheet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              style={
                viewMode === 'broadsheet'
                  ? { transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }
                  : undefined
              }
              className={`epaper-print-page border rounded-lg p-6 sm:p-10 shadow-sm space-y-6 transition-transform ${sheetClass}`}
            >
              {/* Our Pride Broadsheet Double-Rule Masthead */}
              <header className="border-b-2 border-[#00652E] pb-1">
                <div className="border-b border-current/20 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        Our Pride · Local City Broadsheet · {activeCity.state_name}
                        {Boolean(activeCity.is_capital) ? ' · Capital City ‡' : ''}
                      </span>
                    </div>
                    <h2 className="font-editorial text-2xl sm:text-4xl font-extrabold mt-1 tracking-tight">
                      OUR PRIDE — {activeCity.name.replace(' (town)', '').toUpperCase()}
                    </h2>
                    <p className="text-xs opacity-75 mt-1">
                      Maheep News Portal · Everyday City &amp; Civic Dispatches · सच के साथ, जनता के विश्वास के साथ
                    </p>
                  </div>

                  <div className="text-left sm:text-right text-xs font-mono-tabular space-y-1 opacity-90">
                    <div className="font-semibold">
                      Edition Date: {activeDate} · India Rank #{activeCity.rank}
                    </div>
                    {weather && (
                      <div className="inline-flex items-center gap-1.5 text-[#00652E] dark:text-[#4ade80] font-semibold">
                        <CloudSun className="w-3.5 h-3.5" />
                        <span>
                          {weather.temperature}°C · {weather.condition} · Wind {weather.windSpeed} km/h
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {/* Census Demographic & Coordinate Strip */}
              <div className="border-y border-current/15 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-mono-tabular opacity-85">
                <span>
                  2011 Census: <strong>{formatIndianPopulation(activeCity.census_2011)}</strong>
                </span>
                <span>
                  2001 Census: <strong>{formatIndianPopulation(activeCity.census_2001)}</strong>
                </span>
                <span>
                  Decadal Change: <strong>{activeCity.change_pct || '—'}</strong>
                </span>
                <span>
                  Location:{' '}
                  <strong>
                    {formatCoord(activeCity.lat, 'N', 'S')}, {formatCoord(activeCity.lon, 'E', 'W')}
                  </strong>
                </span>
                <div className="flex items-center gap-4 ml-auto">
                  {Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY) && (
                    <button
                      type="button"
                      onClick={() => setShowCityMap((v) => !v)}
                      className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline no-print"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {showCityMap ? 'Hide City Map' : 'Interactive City Map'}
                    </button>
                  )}
                  {activeCity.state_slug && (
                    <Link
                      to={`/states/${activeCity.state_slug}`}
                      className="text-[#00652E] dark:text-[#4ade80] font-semibold hover:underline font-sans"
                    >
                      Open {activeCity.state_name} Desk →
                    </Link>
                  )}
                </div>
              </div>

              {showCityMap && (
                <div className="space-y-2 no-print">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#00652E] dark:text-[#4ade80]">
                      Google Maps · {activeCity.name.replace(' (town)', '')} &amp; Nearby {activeCity.state_name} Cities
                    </span>
                    <span className="text-[11px] opacity-70">Click any green pin to switch city broadsheet</span>
                  </div>
                  <OurPrideCityLocationMap
                    activeCity={activeCity}
                    allCities={cities}
                    onSelectCitySlug={(nextSlug) => setSelectedSlug(nextSlug)}
                  />
                </div>
              )}

              {broadsheetAd && (
                <div className="border border-[#00652E]/40 rounded p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Advertisement</strong>
                    {broadsheetAd.advertiser ? ` · ${broadsheetAd.advertiser}` : ''}: {broadsheetAd.title}
                  </span>
                  {broadsheetAd.target_url && (
                    <a
                      href={broadsheetAd.target_url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                    >
                      {broadsheetAd.cta_text || 'Learn More'} →
                    </a>
                  )}
                </div>
              )}

              {/* Primary City Stories for Selected Date */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-current/20 pb-2">
                  <h3 className="font-editorial text-xl font-bold">
                    {activeCity.name.replace(' (town)', '')} Daily Dispatches ({activeDate})
                  </h3>
                  <span className="text-xs font-mono-tabular opacity-75">
                    {cityArticles.length} city {cityArticles.length === 1 ? 'report' : 'reports'}
                  </span>
                </div>

                {cityArticles.length > 0 ? (
                  <div className={viewMode === 'article' ? 'max-w-2xl mx-auto space-y-6' : 'grid grid-cols-1 md:grid-cols-2 gap-7'}>
                    {cityArticles.map((art, idx) =>
                      renderBroadsheetArticle(art, viewMode === 'broadsheet' && idx === 0, idx),
                    )}
                  </div>
                ) : (
                  <div className="p-5 rounded border border-current/15 text-sm space-y-2 opacity-90">
                    <p className="font-semibold">
                      No city-specific wire story timestamped on {activeDate} for {activeCity.name.replace(' (town)', '')} yet.
                    </p>
                    <p className="text-xs opacity-80">
                      Use &ldquo;Refresh City Wire&rdquo; above to fetch the latest dispatches for{' '}
                      {activeCity.name.replace(' (town)', '')}, or read recent city &amp; {activeCity.state_name}{' '}
                      regional coverage below.
                    </p>
                  </div>
                )}
              </section>

              {/* Recent City Archive Dispatches */}
              {recentCityArticles.length > 0 && (
                <section className="space-y-4 pt-4 border-t border-current/20">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-editorial text-lg font-bold">
                      Recent {activeCity.name.replace(' (town)', '')} Archive
                    </h3>
                    <span className="text-xs font-mono-tabular opacity-75">
                      {recentCityArticles.length} recent city reports
                    </span>
                  </div>
                  <div className={viewMode === 'article' ? 'max-w-2xl mx-auto space-y-6' : 'grid grid-cols-1 md:grid-cols-2 gap-7'}>
                    {recentCityArticles.slice(0, 6).map((art, idx) =>
                      renderBroadsheetArticle(art, false, idx),
                    )}
                  </div>
                </section>
              )}

              {/* State Companion Regional Section */}
              {stateArticles.length > 0 && (
                <section className="space-y-4 pt-4 border-t border-current/20">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-editorial text-lg font-bold">
                      {activeCity.state_name} Regional Companion Desk
                    </h3>
                    <span className="text-xs font-mono-tabular opacity-75">
                      {stateArticles.length} state &amp; regional reports
                    </span>
                  </div>
                  <div className={viewMode === 'article' ? 'max-w-2xl mx-auto space-y-6' : 'grid grid-cols-1 md:grid-cols-2 gap-7'}>
                    {stateArticles.slice(0, 6).map((art, idx) =>
                      renderBroadsheetArticle(art, false, idx),
                    )}
                  </div>
                </section>
              )}

              <footer className="pt-4 border-t border-current/15 flex flex-wrap items-center justify-between gap-2 text-xs opacity-70 font-mono-tabular">
                <span>
                  Our Pride · {activeCity.name.replace(' (town)', '')}, {activeCity.state_name}
                </span>
                <span>Maheep News Portal · Everyday Local Broadsheet</span>
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
