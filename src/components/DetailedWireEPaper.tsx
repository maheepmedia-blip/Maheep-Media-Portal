import {
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  Landmark,
  MapPin,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  Search,
  Square,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { CountryDirectoryItem } from '../../shared/countries.ts';
import { usePortal } from '../context/PortalContext.tsx';
import type { Advertisement, CityItem, StateItem } from '../types/news.ts';
import { formatIndiaDateTime } from '../utils/date.ts';
import { speakNewspaperText, stopNewspaperSpeech } from '../utils/speech.ts';
import { ArticleImage } from './ArticleImage.tsx';
import { VerifiedAuthenticBadge } from './VerifiedAuthenticBadge.tsx';

type PaperTheme = 'light' | 'sepia' | 'dark';
type ReaderViewMode = 'broadsheet' | 'article';
type TextScale = 'compact' | 'standard' | 'large';
export type WireDeskMode = 'beacon' | 'our-pride' | 'worldwire';

interface WireDispatchItem {
  id: string;
  scope_type: 'city' | 'state' | 'country';
  scope_slug: string;
  scope_label: string;
  beat: string;
  title: string;
  summary: string;
  detailed_body: string;
  image_url: string;
  image_rights: string;
  source_name: string;
  source_url: string;
  author: string;
  language: string;
  published_at: string;
  is_curated?: boolean;
  slug?: string;
}

interface Wire300Response {
  scope: {
    scopeType: 'city' | 'state' | 'country';
    scopeSlug: string;
    label: string;
    sublabel: string;
    stateName?: string;
    capital?: string;
    region?: string;
    lat?: number;
    lon?: number;
    census2011?: number;
    census2001?: number | null;
    changePct?: string;
  };
  totalAvailable: number;
  totalFiltered: number;
  maxTarget: number;
  page: number;
  pageSize: number;
  totalPages: number;
  beatCounts: Record<string, number>;
  availableDates: Array<{ date: string; count: number }>;
  dispatches: WireDispatchItem[];
  syncStatus: {
    lastSyncedAt: string;
    fetchedNow: number;
  };
}

interface DetailedReportData {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
  imageUrl: string;
  imageRights: string;
  sourceName: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  scopeLabel: string;
}

interface DetailedWireEPaperProps {
  deskMode: WireDeskMode;
  paperTheme: PaperTheme;
  setPaperTheme: (t: PaperTheme) => void;
  viewMode: ReaderViewMode;
  setViewMode: (v: ReaderViewMode) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  fullscreen: boolean;
  setFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  initialSlug?: string;
  initialScopeType?: 'city' | 'state' | 'country';
  onSyncParams?: (scopeType: 'city' | 'state' | 'country', slug: string) => void;
  broadsheetAd: Advertisement | null;
}

const BEAT_LABELS: Array<{ id: string; label: string; hiLabel: string }> = [
  { id: 'all', label: 'All Beats', hiLabel: 'सभी श्रेणियां' },
  { id: 'top', label: 'Top Stories', hiLabel: 'प्रमुख समाचार' },
  { id: 'governance', label: 'Governance & Civic', hiLabel: 'शासन एवं नागरिक सेवाएं' },
  { id: 'economy', label: 'Economy & Jobs', hiLabel: 'अर्थव्यवस्था एवं रोजगार' },
  { id: 'society', label: 'Health & Education', hiLabel: 'स्वास्थ्य एवं शिक्षा' },
  { id: 'law', label: 'Law & Diplomacy', hiLabel: 'कानून एवं कूटनीति' },
  { id: 'culture', label: 'Culture & Sports', hiLabel: 'संस्कृति एवं खेल' },
  { id: 'regional', label: 'Archive & Regional', hiLabel: 'क्षेत्रीय एवं संग्रह' },
];

const QUICK_CITIES = [
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
];

const QUICK_COUNTRIES = [
  { slug: 'united-states', label: 'United States' },
  { slug: 'united-kingdom', label: 'United Kingdom' },
  { slug: 'china', label: 'China' },
  { slug: 'russia', label: 'Russia' },
  { slug: 'japan', label: 'Japan' },
  { slug: 'united-arab-emirates', label: 'UAE' },
  { slug: 'germany', label: 'Germany' },
  { slug: 'france', label: 'France' },
  { slug: 'australia', label: 'Australia' },
  { slug: 'singapore', label: 'Singapore' },
];

const QUICK_BEACON: Array<{ scopeType: 'country' | 'state'; slug: string; label: string }> = [
  { scopeType: 'country', slug: 'india', label: 'India · National' },
  { scopeType: 'state', slug: 'maharashtra', label: 'Maharashtra' },
  { scopeType: 'state', slug: 'uttar-pradesh', label: 'Uttar Pradesh' },
  { scopeType: 'state', slug: 'delhi', label: 'Delhi' },
  { scopeType: 'state', slug: 'karnataka', label: 'Karnataka' },
  { scopeType: 'state', slug: 'tamil-nadu', label: 'Tamil Nadu' },
  { scopeType: 'state', slug: 'west-bengal', label: 'West Bengal' },
  { scopeType: 'state', slug: 'bihar', label: 'Bihar' },
  { scopeType: 'state', slug: 'gujarat', label: 'Gujarat' },
  { scopeType: 'state', slug: 'rajasthan', label: 'Rajasthan' },
];

function formatIndianPopulation(num?: number | null): string {
  if (!num || num <= 0) return '—';
  return new Intl.NumberFormat('en-IN').format(num);
}

function formatCoord(val: number | undefined, pos: string, neg: string): string {
  if (val === undefined || Number.isNaN(val)) return '—';
  return `${Math.abs(val).toFixed(2)}°${val >= 0 ? pos : neg}`;
}

export function DetailedWireEPaper({
  deskMode,
  paperTheme,
  setPaperTheme,
  viewMode,
  setViewMode,
  zoom,
  setZoom,
  fullscreen,
  setFullscreen,
  initialSlug,
  initialScopeType,
  onSyncParams,
  broadsheetAd,
}: DetailedWireEPaperProps) {
  const { language, setLanguage } = usePortal();
  const isHi = language === 'hi';

  const defaultScopeType: 'city' | 'state' | 'country' =
    deskMode === 'our-pride'
      ? 'city'
      : deskMode === 'worldwire'
        ? 'country'
        : initialScopeType === 'state'
          ? 'state'
          : 'country';

  const defaultSlug =
    initialSlug ||
    (deskMode === 'our-pride'
      ? 'mumbai'
      : deskMode === 'worldwire'
        ? 'united-states'
        : defaultScopeType === 'state'
          ? 'maharashtra'
          : 'india');

  const [scopeType, setScopeType] = useState<'city' | 'state' | 'country'>(defaultScopeType);
  const [scopeSlug, setScopeSlug] = useState<string>(defaultSlug);

  // Directory datasets
  const [cities, setCities] = useState<CityItem[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);
  const [countries, setCountries] = useState<CountryDirectoryItem[]>([]);
  const [dirSearch, setDirSearch] = useState('');
  const [dirGroupFilter, setDirGroupFilter] = useState('');

  // Edition & pagination state
  const [page, setPage] = useState(1);
  const [beat, setBeat] = useState('all');
  const [storyQuery, setStoryQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [wireData, setWireData] = useState<Wire300Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Reader UX state
  const [textScale, setTextScale] = useState<TextScale>('standard');
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [weather, setWeather] = useState<{
    temperature: number;
    condition: string;
    windSpeed: number;
  } | null>(null);

  // Detailed Report Modal
  const [modalDetail, setModalDetail] = useState<DetailedReportData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Debounce story search query
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(storyQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storyQuery]);

  // Sync defaults when switching between Beacon, Our Pride, and WorldWire tabs
  useEffect(() => {
    setPage(1);
    setBeat('all');
    setStoryQuery('');
    setDebouncedQuery('');
    setDateFilter('');
    setDirSearch('');
    setDirGroupFilter('');

    if (deskMode === 'our-pride') {
      setScopeType('city');
      setScopeSlug(initialScopeType === 'city' && initialSlug ? initialSlug : 'mumbai');
    } else if (deskMode === 'worldwire') {
      setScopeType('country');
      setScopeSlug(initialScopeType === 'country' && initialSlug && initialSlug !== 'india' ? initialSlug : 'united-states');
    } else {
      const nextType = initialScopeType === 'state' ? 'state' : 'country';
      setScopeType(nextType);
      setScopeSlug(
        nextType === 'state' ? initialSlug || 'maharashtra' : 'india',
      );
    }
  }, [deskMode]);

  // Sync external URL navigation (e.g. header City Selector) within the same desk
  useEffect(() => {
    if (!initialSlug) return;
    const expectedType: 'city' | 'state' | 'country' =
      deskMode === 'our-pride'
        ? 'city'
        : deskMode === 'worldwire'
          ? 'country'
          : initialScopeType === 'state'
            ? 'state'
            : 'country';
    if (
      (deskMode === 'our-pride' && expectedType === 'city' && initialSlug !== scopeSlug) ||
      (deskMode === 'worldwire' && expectedType === 'country' && initialSlug !== 'india' && initialSlug !== scopeSlug) ||
      (deskMode === 'beacon' && (expectedType !== scopeType || initialSlug !== scopeSlug))
    ) {
      setScopeType(expectedType);
      setScopeSlug(initialSlug);
      setPage(1);
    }
  }, [initialSlug, initialScopeType]);

  // Load appropriate sidebar directory
  useEffect(() => {
    let active = true;
    if (deskMode === 'our-pride' && cities.length === 0) {
      fetch('/api/cities?limit=400')
        .then((r) => r.json())
        .then((j) => {
          if (active && Array.isArray(j.cities)) setCities(j.cities);
        })
        .catch(() => {});
    }
    if (deskMode === 'beacon' && states.length === 0) {
      fetch('/api/states')
        .then((r) => r.json())
        .then((j) => {
          if (active && Array.isArray(j.states)) setStates(j.states);
        })
        .catch(() => {});
    }
    if ((deskMode === 'worldwire' || deskMode === 'beacon') && countries.length === 0) {
      fetch('/api/epaper/countries')
        .then((r) => r.json())
        .then((j) => {
          if (active && Array.isArray(j.countries)) setCountries(j.countries);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [deskMode, cities.length, states.length, countries.length]);

  const loadWire = useCallback(
    async (forceRefresh = false) => {
      if (!scopeSlug) return;
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({
          scope: scopeType,
          slug: scopeSlug,
          page: String(page),
          pageSize: '12',
          beat,
          lang: language,
        });
        if (debouncedQuery) qs.set('q', debouncedQuery);
        if (dateFilter) qs.set('date', dateFilter);
        if (forceRefresh) qs.set('refresh', '1');

        const res = await fetch(`/api/epaper/wire300?${qs.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load E-Paper wire');
        setWireData(json as Wire300Response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load E-Paper dispatches.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scopeType, scopeSlug, page, beat, debouncedQuery, dateFilter, language],
  );

  useEffect(() => {
    void loadWire(false);
    if (onSyncParams) onSyncParams(scopeType, scopeSlug);
  }, [loadWire]);

  // Weather for City mode
  useEffect(() => {
    const lat = wireData?.scope?.lat;
    const lon = wireData?.scope?.lon;
    if (scopeType !== 'city' || lat === undefined || lon === undefined) {
      setWeather(null);
      return;
    }
    let active = true;
    fetch(`/api/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.current) {
          setWeather({
            temperature: Number(json.current.temperature ?? 0),
            condition: String(json.current.condition || ''),
            windSpeed: Number(json.current.windSpeed ?? 0),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [scopeType, wireData?.scope?.lat, wireData?.scope?.lon]);

  useEffect(() => {
    stopNewspaperSpeech();
    setSpeakingTarget(null);
  }, [scopeType, scopeSlug, page]);

  useEffect(() => {
    return () => {
      stopNewspaperSpeech();
    };
  }, []);

  const openDetailedReport = async (item: WireDispatchItem) => {
    setLoadingDetail(true);
    setModalDetail({
      id: item.id,
      title: item.title,
      summary: item.summary,
      paragraphs: (item.detailed_body || item.summary || item.title)
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean),
      imageUrl: item.image_url,
      imageRights: item.image_rights,
      sourceName: item.source_name,
      sourceUrl: item.source_url,
      author: item.author,
      publishedAt: item.published_at,
      scopeLabel: item.scope_label,
    });
    try {
      const res = await fetch(
        `/api/epaper/wire300/detail?id=${encodeURIComponent(item.id)}&lang=${encodeURIComponent(language)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const json = await res.json();
        if (json.detail) setModalDetail(json.detail);
      }
    } catch {
      // Keep immediate preview detail
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!modalDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalDetail(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalDetail]);

  const stateFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cities) {
      if (c.state_name) set.add(c.state_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cities]);

  const filteredCities = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return cities.filter((c) => {
      if (dirGroupFilter && c.state_name !== dirGroupFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.state_name.toLowerCase().includes(q) ||
        String(c.rank).includes(q)
      );
    });
  }, [cities, dirSearch, dirGroupFilter]);

  const filteredStates = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return states.filter((s) => {
      if (dirGroupFilter && s.type !== dirGroupFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q)
      );
    });
  }, [states, dirSearch, dirGroupFilter]);

  const worldCountries = useMemo(
    () => countries.filter((c) => (deskMode === 'worldwire' ? c.slug !== 'india' : true)),
    [countries, deskMode],
  );

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of worldCountries) set.add(c.region);
    return Array.from(set);
  }, [worldCountries]);

  const filteredCountries = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return worldCountries.filter((c) => {
      if (dirGroupFilter && c.region !== dirGroupFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.capital.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q)
      );
    });
  }, [worldCountries, dirSearch, dirGroupFilter]);

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

  const dispatches = wireData?.dispatches || [];

  const togglePageSpeech = () => {
    if (dispatches.length === 0) return;
    if (speakingTarget === 'page') {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    const transcript = dispatches
      .slice(0, 8)
      .map((d, idx) => `${isHi ? 'समाचार' : 'Report'} ${idx + 1}. ${d.title}. ${d.summary}`)
      .join(' ');
    speakNewspaperText(
      `${wireData?.scope.label || 'Maheep E-Paper'} ${isHi ? 'पृष्ठ' : 'Page'} ${page}. ${transcript}`,
      {
        lang: isHi ? 'hi' : 'en',
        onStart: () => setSpeakingTarget('page'),
        onEnd: () => setSpeakingTarget((curr) => (curr === 'page' ? null : curr)),
      },
    );
  };

  const toggleStorySpeech = (key: string, title: string, summary: string) => {
    if (speakingTarget === key) {
      stopNewspaperSpeech();
      setSpeakingTarget(null);
      return;
    }
    speakNewspaperText(`${title}. ${summary}`, {
      lang: isHi ? 'hi' : 'en',
      onStart: () => setSpeakingTarget(key),
      onEnd: () => setSpeakingTarget((curr) => (curr === key ? null : curr)),
    });
  };

  const copyStoryClip = async (key: string, art: WireDispatchItem) => {
    const clip = `${art.title}\n\n${art.summary}\n\n— ${wireData?.scope.label || 'Maheep E-Paper'} · ${art.source_name}\n${art.source_url}`;
    try {
      await navigator.clipboard.writeText(clip);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const selectScope = (nextType: 'city' | 'state' | 'country', nextSlug: string) => {
    setScopeType(nextType);
    setScopeSlug(nextSlug);
    setPage(1);
    setBeat('all');
    setDateFilter('');
  };

  const deskTitle = isHi
    ? deskMode === 'our-pride'
      ? 'अवर प्राइड'
      : deskMode === 'worldwire'
        ? 'वर्ल्डवायर'
        : 'द बीकन'
    : deskMode === 'our-pride'
      ? 'OUR PRIDE'
      : deskMode === 'worldwire'
        ? 'WORLDWIRE'
        : 'THE BEACON';

  const deskTagline = isHi
    ? deskMode === 'our-pride'
      ? 'दैनिक शहर ब्रॉडशीट · 339 भारतीय शहर · 300 समाचारों का स्थानीय संस्करण'
      : deskMode === 'worldwire'
        ? 'अंतरराष्ट्रीय एवं देश ब्रॉडशीट · 50 देश · 300 समाचारों का वैश्विक संस्करण'
        : 'राष्ट्रीय एवं 36 राज्य/केंद्र शासित प्रदेश ब्रॉडशीट · 300 समाचारों का विस्तृत संस्करण'
    : deskMode === 'our-pride'
      ? 'Everyday City Broadsheet · 339 Indian Cities · 300-Dispatch Local Wire'
      : deskMode === 'worldwire'
        ? 'Global & Country Broadsheet · 50 Nations · 300-Dispatch International Wire'
        : 'India National & 36 States/UTs Broadsheet · 300-Dispatch Detailed Wire';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Sidebar Directory */}
      {!fullscreen && (
        <aside className="lg:col-span-3 space-y-4 no-print">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 space-y-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80]">
                {deskMode === 'our-pride'
                  ? `${isHi ? 'अवर प्राइड · सभी शहर' : 'Our Pride · All Cities'} (${cities.length || 339})`
                  : deskMode === 'worldwire'
                    ? `${isHi ? 'वर्ल्डवायर · देश' : 'WorldWire · Countries'} (${worldCountries.length || 49})`
                    : `${isHi ? 'द बीकन · भारत एवं राज्य' : 'The Beacon · India & States'} (${states.length || 36})`}
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {isHi
                  ? 'प्रत्येक चयन के लिए 25 पृष्ठों में 300 समाचार (12 समाचार प्रति पृष्ठ)।'
                  : 'Up to 300 detailed dispatches across 25 broadsheet pages (10–15 reports/page) for every selection.'}
              </p>
            </div>

            {deskMode === 'beacon' && (
              <button
                type="button"
                onClick={() => selectScope('country', 'india')}
                className={`w-full text-left px-3 py-2.5 rounded-md text-xs font-semibold border flex items-center justify-between transition-colors ${
                  scopeType === 'country' && scopeSlug === 'india'
                    ? 'bg-[#00652E] text-white border-[#00652E]'
                    : 'bg-[#EAF5E5]/60 dark:bg-[#00451F]/30 text-[#00652E] dark:text-[#4ade80] border-[#00652E]/30 hover:bg-[#00652E] hover:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5" />
                  India · Union National Edition
                </span>
                <span className="font-mono-tabular text-[10px]">300</span>
              </button>
            )}

            <div className="relative">
              <input
                type="search"
                value={dirSearch}
                onChange={(e) => setDirSearch(e.target.value)}
                placeholder={
                  deskMode === 'our-pride'
                    ? 'Search city or state...'
                    : deskMode === 'worldwire'
                      ? 'Search country or capital...'
                      : 'Search Indian state or capital...'
                }
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {deskMode === 'our-pride' && (
              <select
                aria-label="Filter cities by State"
                value={dirGroupFilter}
                onChange={(e) => setDirGroupFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="">All States &amp; UTs ({stateFilterOptions.length})</option>
                {stateFilterOptions.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            )}

            {deskMode === 'beacon' && (
              <select
                aria-label="Filter States or UTs"
                value={dirGroupFilter}
                onChange={(e) => setDirGroupFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="">All States &amp; Union Territories (36)</option>
                <option value="state">28 States</option>
                <option value="ut">8 Union Territories</option>
              </select>
            )}

            {deskMode === 'worldwire' && (
              <select
                aria-label="Filter countries by Region"
                value={dirGroupFilter}
                onChange={(e) => setDirGroupFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="">All World Regions ({worldCountries.length} Countries)</option>
                {regionOptions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            )}

            <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
              {deskMode === 'our-pride' && cities.length === 0 && (
                <p className="text-xs text-neutral-500 py-3">Loading Indian cities directory...</p>
              )}
              {deskMode === 'beacon' && states.length === 0 && (
                <p className="text-xs text-neutral-500 py-3">Loading Indian states directory...</p>
              )}
              {deskMode === 'worldwire' && countries.length === 0 && (
                <p className="text-xs text-neutral-500 py-3">Loading global countries directory...</p>
              )}
              {deskMode === 'our-pride' &&
                filteredCities.map((c) => {
                  const active = scopeType === 'city' && scopeSlug === c.slug;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectScope('city', c.slug)}
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
                          {Boolean(c.is_capital) && <span className="ml-1">‡</span>}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 flex items-center justify-between ${
                          active ? 'text-[#EAF5E5]' : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        <span className="truncate">{c.state_name}</span>
                        <span className="font-mono-tabular shrink-0">{formatIndianPopulation(c.census_2011)}</span>
                      </div>
                    </button>
                  );
                })}

              {deskMode === 'beacon' &&
                filteredStates.map((st) => {
                  const active = scopeType === 'state' && scopeSlug === st.slug;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => selectScope('state', st.slug)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors border ${
                        active
                          ? 'bg-[#00652E] text-white border-[#00652E] font-semibold'
                          : 'border-transparent hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{st.name}</span>
                        <span
                          className={`font-mono-tabular text-[10px] uppercase ${
                            active ? 'text-[#EAF5E5]' : 'text-neutral-400'
                          }`}
                        >
                          {st.code}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 flex items-center justify-between ${
                          active ? 'text-[#EAF5E5]' : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        <span>{st.type === 'ut' ? 'Union Territory' : 'State'}</span>
                        <span>300-Dispatch Desk</span>
                      </div>
                    </button>
                  );
                })}

              {deskMode === 'worldwire' &&
                filteredCountries.map((ct) => {
                  const active = scopeType === 'country' && scopeSlug === ct.slug;
                  return (
                    <button
                      key={ct.slug}
                      type="button"
                      onClick={() => selectScope('country', ct.slug)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors border ${
                        active
                          ? 'bg-[#00652E] text-white border-[#00652E] font-semibold'
                          : 'border-transparent hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{ct.name}</span>
                        <span
                          className={`text-[10px] shrink-0 ${
                            active ? 'text-[#EAF5E5]' : 'text-neutral-400'
                          }`}
                        >
                          {ct.region}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          active ? 'text-[#EAF5E5]' : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        Capital: {ct.capital}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Beat Breakdown Directory */}
          {wireData && (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                {isHi ? `समाचार श्रेणियां (${wireData.totalAvailable} रिपोर्ट)` : `Section Beats (${wireData.totalAvailable} Stories)`}
              </h2>
              <div className="space-y-1">
                {BEAT_LABELS.map((b) => {
                  const count = wireData.beatCounts[b.id] || 0;
                  if (b.id !== 'all' && count === 0) return null;
                  const active = beat === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBeat(b.id);
                        setPage(1);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                        active
                          ? 'bg-[#00652E] text-white font-semibold'
                          : 'hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <span>{isHi ? b.hiLabel : b.label}</span>
                      <span className="font-mono-tabular text-[11px]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Archive Dates */}
          {wireData && wireData.availableDates.length > 0 && (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Dates in Wire
                </h2>
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFilter('');
                      setPage(1);
                    }}
                    className="text-[11px] font-semibold text-[#00652E] hover:underline"
                  >
                    All Dates
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {wireData.availableDates.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setDateFilter(d.date === dateFilter ? '' : d.date);
                      setPage(1);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded border text-xs flex items-center justify-between transition-colors ${
                      dateFilter === d.date
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

      {/* Main Reader Area */}
      <div className={`${fullscreen ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-4`}>
        {/* Top Quick-Jump Strip */}
        {!fullscreen && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border-b border-neutral-200 dark:border-neutral-800 pb-2.5 no-print">
            <span className="font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mr-1">
              Quick Switch:
            </span>
            {deskMode === 'beacon'
              ? QUICK_BEACON.map((item, idx) => {
                  const isCurrent = item.scopeType === scopeType && item.slug === scopeSlug;
                  return (
                    <React.Fragment key={`${item.scopeType}-${item.slug}`}>
                      {idx > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
                      <button
                        type="button"
                        onClick={() => selectScope(item.scopeType, item.slug)}
                        className={`whitespace-nowrap transition-colors ${
                          isCurrent
                            ? 'font-bold text-[#00652E] dark:text-[#4ade80] underline underline-offset-4'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-[#00652E] dark:hover:text-[#4ade80]'
                        }`}
                      >
                        {item.label}
                      </button>
                    </React.Fragment>
                  );
                })
              : (deskMode === 'our-pride' ? QUICK_CITIES : QUICK_COUNTRIES).map((item, idx) => {
                  const isCurrent = item.slug === scopeSlug;
                  return (
                    <React.Fragment key={item.slug}>
                      {idx > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
                      <button
                        type="button"
                        onClick={() => selectScope(deskMode === 'our-pride' ? 'city' : 'country', item.slug)}
                        className={`whitespace-nowrap transition-colors ${
                          isCurrent
                            ? 'font-bold text-[#00652E] dark:text-[#4ade80] underline underline-offset-4'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-[#00652E] dark:hover:text-[#4ade80]'
                        }`}
                      >
                        {item.label}
                      </button>
                    </React.Fragment>
                  );
                })}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-100 dark:bg-neutral-900 px-4 py-2.5 rounded-lg no-print">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <input
                type="search"
                value={storyQuery}
                onChange={(e) => {
                  setStoryQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={isHi ? '300 समाचारों में खोजें...' : 'Filter inside 300 reports...'}
                className="w-44 sm:w-56 pl-7 pr-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
            </div>

            <button
              type="button"
              disabled={refreshing || loading}
              onClick={() => void loadWire(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00652E] hover:bg-[#00451F] text-white font-semibold disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing
                ? isHi
                  ? 'लोड हो रहा है...'
                  : 'Syncing 300 Wire...'
                : isHi
                  ? '300 समाचार ताज़ा करें'
                  : 'Refresh 300 Wire'}
            </button>

            <div
              className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950"
              role="group"
              aria-label="Edition Language"
            >
              {(['all', 'en', 'hi'] as const).map((langOpt) => (
                <button
                  key={langOpt}
                  type="button"
                  onClick={() => setLanguage(langOpt)}
                  className={`px-2 py-1 font-semibold whitespace-nowrap ${
                    language === langOpt ? 'bg-[#00652E] text-white' : ''
                  }`}
                >
                  {langOpt === 'all' ? 'All' : langOpt === 'en' ? 'English' : 'हिन्दी'}
                </button>
              ))}
            </div>
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

            <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950">
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
              onClick={togglePageSpeech}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-semibold whitespace-nowrap ${
                speakingTarget === 'page'
                  ? 'bg-[#00652E] text-white border-[#00652E]'
                  : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 hover:border-[#00652E]'
              }`}
            >
              {speakingTarget === 'page' ? (
                <>
                  <Square className="w-3 h-3" /> Stop
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" /> Listen
                </>
              )}
            </button>

            {viewMode === 'broadsheet' && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono-tabular">
                <button type="button" onClick={() => setZoom((z) => Math.max(75, z - 15))} aria-label="Zoom out">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1">{zoom}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(130, z + 15))} aria-label="Zoom in">
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

        {/* 25-Page Newspaper Pagination Strip */}
        {wireData && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs no-print">
            <div className="flex items-center gap-2 font-mono-tabular">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 hover:border-[#00652E]"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="font-semibold">
                Page {wireData.page} / {wireData.totalPages} · {wireData.totalFiltered} Reports Loaded
              </span>
              <button
                type="button"
                disabled={page >= wireData.totalPages}
                onClick={() => setPage((p) => Math.min(wireData.totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 hover:border-[#00652E]"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 font-mono-tabular">
              {Array.from({ length: wireData.totalPages }, (_, i) => i + 1).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                    pNum === wireData.page
                      ? 'bg-[#00652E] text-white border-[#00652E]'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-[#00652E]'
                  }`}
                >
                  {pNum}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-[#DF2525]">
            {error}
          </div>
        )}

        {/* Broadsheet Canvas */}
        {loading && !wireData ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-500 space-y-2">
            <div className="font-semibold text-neutral-900 dark:text-white">
              {isHi ? '300 समाचारों का हिंदी संस्करण तैयार हो रहा है...' : 'Compiling 300-Dispatch Detailed Edition...'}
            </div>
            <p className="text-xs">
              {isHi
                ? 'शासन, अर्थव्यवस्था, स्थानीय प्रशासन, शिक्षा, कानून और संस्कृति से जुड़े प्रमाणित समाचार संकलित किए जा रहे हैं।'
                : 'Gathering live verified multi-beat reports across Governance, Economy, Civic Infra, Education, Law & Culture.'}
            </p>
          </div>
        ) : !wireData ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-500">
            {isHi
              ? '300 समाचारों वाला विस्तृत ई-पेपर खोलने के लिए बाईं ओर से शहर, राज्य या देश चुनें।'
              : 'Select a location from the directory to open its 300-report detailed E-Paper.'}
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
              {/* Broadsheet Header */}
              <header className="border-b-2 border-[#00652E] pb-1">
                <div className="border-b border-current/20 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80] flex items-center gap-1.5">
                      {deskMode === 'worldwire' ? (
                        <Globe2 className="w-3.5 h-3.5" />
                      ) : deskMode === 'beacon' ? (
                        <Landmark className="w-3.5 h-3.5" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {deskTitle} · {wireData.scope.sublabel}
                      </span>
                    </div>
                    <h2 className="font-editorial text-2xl sm:text-4xl font-extrabold mt-1 tracking-tight">
                      {deskTitle} — {wireData.scope.label.toUpperCase()}
                    </h2>
                    <p className="text-xs opacity-75 mt-1">{deskTagline}</p>
                  </div>

                  <div className="text-left sm:text-right text-xs font-mono-tabular space-y-1 opacity-90">
                    <div className="font-semibold">
                      {isHi
                        ? `पृष्ठ ${wireData.page} / ${wireData.totalPages} · ${wireData.totalAvailable} समाचार उपलब्ध`
                        : `Page ${wireData.page} of ${wireData.totalPages} · ${wireData.totalAvailable} Dispatches Indexed`}
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

              {/* Metadata Strip (Census for City, Capital/Region for State/Country) */}
              <div className="border-y border-current/15 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-mono-tabular opacity-85">
                {wireData.scope.scopeType === 'city' && (
                  <>
                    <span>
                      2011 Census: <strong>{formatIndianPopulation(wireData.scope.census2011)}</strong>
                    </span>
                    <span>
                      Decadal Change: <strong>{wireData.scope.changePct || '—'}</strong>
                    </span>
                    <span>
                      Coordinates:{' '}
                      <strong>
                        {formatCoord(wireData.scope.lat, 'N', 'S')}, {formatCoord(wireData.scope.lon, 'E', 'W')}
                      </strong>
                    </span>
                  </>
                )}
                {wireData.scope.scopeType === 'state' && (
                  <>
                    <span>
                      Capital: <strong>{wireData.scope.capital || '—'}</strong>
                    </span>
                    <span>
                      Desk Coverage: <strong>Governance, Economy, Courts, Districts &amp; Society</strong>
                    </span>
                  </>
                )}
                {wireData.scope.scopeType === 'country' && (
                  <>
                    <span>
                      Region: <strong>{wireData.scope.region || 'Global'}</strong>
                    </span>
                    <span>
                      Capital: <strong>{wireData.scope.capital || '—'}</strong>
                    </span>
                    <span>
                      Coverage: <strong>Politics, Economy, Diplomacy, Science &amp; Society</strong>
                    </span>
                  </>
                )}
                <span className="ml-auto">
                  Showing {(wireData.page - 1) * wireData.pageSize + 1}–
                  {Math.min(wireData.page * wireData.pageSize, wireData.totalFiltered)} of {wireData.totalFiltered}
                </span>
              </div>

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

              {/* Dispatches Multi-Column Broadsheet Grid */}
              {dispatches.length === 0 ? (
                <div className="p-6 rounded border border-current/15 text-sm">
                  No dispatches matched your active filter. Clear the filter or click &ldquo;Refresh 300 Wire&rdquo;.
                </div>
              ) : (
                <div
                  className={
                    viewMode === 'article'
                      ? 'max-w-2xl mx-auto space-y-6'
                      : 'grid grid-cols-1 md:grid-cols-2 gap-7'
                  }
                >
                  {dispatches.map((art, idx) => {
                    const isLead = viewMode === 'broadsheet' && idx === 0;
                    const timeLabel = formatIndiaDateTime(art.published_at);
                    const paras = (art.detailed_body || art.summary || art.title)
                      .split(/\n+/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .slice(0, isLead ? 4 : 2);
                    const globalIdx = (wireData.page - 1) * wireData.pageSize + idx + 1;

                    return (
                      <article
                        key={art.id}
                        className={`pb-5 border-b border-current/15 ${isLead ? 'md:col-span-2' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-[#00652E] dark:text-[#4ade80] mb-1">
                          <span className="truncate">
                            #{globalIdx} · {art.scope_label || wireData.scope.label} · {art.source_name}
                          </span>
                        </div>

                        <div
                          className={
                            isLead && art.image_url
                              ? 'grid grid-cols-1 md:grid-cols-12 gap-5 items-start'
                              : 'space-y-2'
                          }
                        >
                          {isLead && art.image_url && (
                            <figure className="md:col-span-5 space-y-1">
                              <div className="aspect-[4/3] rounded overflow-hidden bg-neutral-100">
                                <ArticleImage
                                  src={art.image_url}
                                  alt={art.title}
                                  category={art.scope_label}
                                  sourceName={art.source_name}
                                  imageRights={art.image_rights}
                                />
                              </div>
                              {art.image_rights && (
                                <figcaption className="text-[10px] opacity-65 italic">{art.image_rights}</figcaption>
                              )}
                            </figure>
                          )}

                          <div className={isLead && art.image_url ? 'md:col-span-7 space-y-2' : 'space-y-2'}>
                            <button
                              type="button"
                              onClick={() => void openDetailedReport(art)}
                              className={`text-left font-editorial font-bold hover:text-[#00652E] block leading-snug ${
                                isLead ? 'text-2xl sm:text-[26px]' : 'text-lg sm:text-xl'
                              }`}
                            >
                              {art.title}
                            </button>

                            <div className="text-[11px] opacity-70 font-mono-tabular">
                              By {art.author || art.source_name}
                              {timeLabel ? ` · ${timeLabel}` : ''}
                            </div>

                            {!isLead && idx <= 3 && art.image_url && (
                              <figure className="space-y-1 my-2">
                                <div className="aspect-[16/9] rounded overflow-hidden bg-neutral-100">
                                  <ArticleImage
                                    src={art.image_url}
                                    alt={art.title}
                                    category={art.scope_label}
                                    sourceName={art.source_name}
                                    imageRights={art.image_rights}
                                  />
                                </div>
                                {art.image_rights && (
                                  <figcaption className="text-[10px] opacity-65 italic">{art.image_rights}</figcaption>
                                )}
                              </figure>
                            )}

                            <div className={`space-y-2 opacity-90 text-justify ${bodyScaleClass}`}>
                              {paras.map((para, pIdx) => (
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
                                <button
                                  type="button"
                                  onClick={() => toggleStorySpeech(art.id, art.title, art.summary)}
                                  className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 text-[#00652E] dark:text-[#4ade80] whitespace-nowrap"
                                >
                                  {speakingTarget === art.id ? (
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
                                  onClick={() => void copyStoryClip(art.id, art)}
                                  className="inline-flex items-center gap-1 font-semibold opacity-80 hover:opacity-100 hover:text-[#00652E] whitespace-nowrap"
                                >
                                  {copiedKey === art.id ? (
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

                              <div className="flex items-center gap-3">
                                {art.is_curated && art.slug && (
                                  <Link
                                    to={`/news/${art.slug}`}
                                    className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
                                  >
                                    Article Page →
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void openDetailedReport(art)}
                                  className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
                                >
                                  Read Detailed Report →
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <footer className="pt-4 border-t border-current/15 flex flex-wrap items-center justify-between gap-2 text-xs opacity-70 font-mono-tabular">
                <span>
                  {deskTitle} · {wireData.scope.label} · Page {wireData.page} of {wireData.totalPages}
                </span>
                <span>Maheep News Portal · Detailed 300-Dispatch E-Paper Edition</span>
              </footer>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Report Expansion Modal */}
      {modalDetail &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4 no-print"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalDetail(null);
            }}
          >
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 shadow-2xl">
              <div className="sticky top-0 z-10 px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-[#FBF9F5] dark:bg-neutral-900 flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80] truncate">
                  {modalDetail.scopeLabel} · {modalDetail.sourceName}
                </div>
                <button
                  type="button"
                  onClick={() => setModalDetail(null)}
                  aria-label="Close detailed report"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <h3 className="font-editorial text-2xl sm:text-3xl font-bold leading-tight text-neutral-950 dark:text-white">
                  {modalDetail.title}
                </h3>

                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tabular flex flex-wrap items-center gap-3">
                  <span>By {modalDetail.author || modalDetail.sourceName}</span>
                  {modalDetail.publishedAt && <span>{formatIndiaDateTime(modalDetail.publishedAt)}</span>}
                  {modalDetail.imageUrl && (
                    <VerifiedAuthenticBadge
                      variant="inline"
                      sourceName={modalDetail.sourceName}
                      imageRights={modalDetail.imageRights}
                      category={modalDetail.scopeLabel}
                    />
                  )}
                </div>

                {modalDetail.imageUrl && (
                  <figure className="space-y-1">
                    <div className="aspect-[16/9] rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                      <ArticleImage
                        src={modalDetail.imageUrl}
                        alt={modalDetail.title}
                        category={modalDetail.scopeLabel}
                        sourceName={modalDetail.sourceName}
                        imageRights={modalDetail.imageRights}
                      />
                    </div>
                    {modalDetail.imageRights && (
                      <figcaption className="text-[11px] text-neutral-500 italic">{modalDetail.imageRights}</figcaption>
                    )}
                  </figure>
                )}

                {loadingDetail && (
                  <p className="text-xs text-[#00652E] dark:text-[#4ade80] font-medium">
                    Loading extended report details from verified publisher source...
                  </p>
                )}

                <div className="space-y-3 text-sm sm:text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
                  {modalDetail.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>

                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                  {modalDetail.sourceUrl && (
                    <a
                      href={modalDetail.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold"
                    >
                      Read Full Publisher Dispatch ({modalDetail.sourceName}) <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalDetail(null)}
                    className="px-4 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold ml-auto"
                  >
                    Back to Broadsheet
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
