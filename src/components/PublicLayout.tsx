import { ArrowUp, Bookmark, BookOpen, Calendar, Compass, Home, MapPin, Menu, Moon, RotateCcw, Search, Sun, User, WifiOff, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { type NewsEdition, getEditionMeta, usePortal } from '../context/PortalContext.tsx';
import type { Article, CityItem } from '../types/news.ts';
import { getIndiaClockParts } from '../utils/date.ts';
import { getSavedArticles, getSavedEpaperPages, READER_LISTS_EVENT } from '../utils/readerLists.ts';
import { captureUtmParams, trackGrowthEvent } from '../utils/utm.ts';
import { CitySelector } from './CitySelector.tsx';
import { CommandSearchModal } from './CommandSearchModal.tsx';
import { ReaderDrawer } from './ReaderDrawer.tsx';
import { SavedReadingDrawer } from './SavedReadingDrawer.tsx';
import { WeatherWidget } from './WeatherWidget.tsx';

interface PublicLayoutProps {
  children: React.ReactNode;
  breakingNews?: Article[];
}

const HEADER_EDITION_OPTIONS: ReadonlyArray<{ id: NewsEdition; brand: string; sub: string }> = [
  { id: 'national', brand: 'The Beacon', sub: 'National' },
  { id: 'international', brand: 'WorldWire', sub: 'International' },
  { id: 'local', brand: 'Our Pride', sub: 'Local' },
  { id: 'all', brand: 'All Desks', sub: 'Full' },
];

export function PublicLayout({ children, breakingNews = [] }: PublicLayoutProps) {
  const {
    language,
    setLanguage,
    darkMode,
    toggleDarkMode,
    readerUser,
    setReaderDrawerOpen,
    selectedEdition,
    selectedDate,
    selectedLocalState,
    selectedLocalCity,
    editionSetupDone,
    setSelectedEdition,
    setSelectedDate,
    selectCityEdition,
    reopenEditionPicker,
  } = usePortal();
  const [clock, setClock] = useState(() => getIndiaClockParts());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMsg, setNewsletterMsg] = useState('');
  const [newsletterConfirmUrl, setNewsletterConfirmUrl] = useState('');
  const [newsletterErr, setNewsletterErr] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [showBackTop, setShowBackTop] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [cmdSearchOpen, setCmdSearchOpen] = useState(false);
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(() => getSavedArticles().length + getSavedEpaperPages().length);

  useEffect(() => {
    const syncSaved = () => setSavedCount(getSavedArticles().length + getSavedEpaperPages().length);
    window.addEventListener(READER_LISTS_EVENT, syncSaved);
    return () => window.removeEventListener(READER_LISTS_EVENT, syncSaved);
  }, []);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(getIndiaClockParts());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    captureUtmParams();
    trackGrowthEvent('page_view', { path: location.pathname, language });
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
      setMobileMenuOpen(false);
    } else {
      navigate('/search');
    }
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterMsg('');
    setNewsletterConfirmUrl('');
    setNewsletterErr('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail, language_pref: language }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewsletterErr(data.error || 'Could not subscribe.');
        return;
      }
      setNewsletterMsg(data.message || 'Subscribed to Maheep Daily Briefing.');
      if (data.confirmUrl) setNewsletterConfirmUrl(data.confirmUrl);
      setNewsletterEmail('');
      trackGrowthEvent('newsletter_signup', { cta_variant: 'footer_form', language });
    } catch {
      setNewsletterErr('Network error. Please try again.');
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap shrink-0 text-sm font-medium pb-1 transition-colors border-b-2 ${
      isActive
        ? 'border-[#00652E] text-[#00652E] dark:border-[#4ade80] dark:text-[#4ade80]'
        : 'border-transparent text-neutral-700 dark:text-neutral-300 hover:text-[#00652E] dark:hover:text-[#4ade80]'
    }`;

  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const yesterdayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 86_400_000));

  const handleHeaderEditionChange = (edition: NewsEdition) => {
    setSelectedEdition(edition);
    if (location.pathname !== '/' && location.pathname !== '/epaper') {
      navigate('/');
    } else if (location.pathname === '/epaper') {
      const sec = edition === 'local' ? 'our-pride' : edition === 'international' ? 'worldwire' : 'beacon';
      navigate(`/epaper?section=${sec}`);
    }
  };

  const handleHeaderDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (location.pathname !== '/' && location.pathname !== '/epaper') {
      navigate('/');
    }
  };

  const handleHeaderCityChange = (city: CityItem | null) => {
    if (city) {
      selectCityEdition(city.slug, city.state_slug || '');
      if (location.pathname === '/epaper') {
        const qp = new URLSearchParams({ section: 'our-pride', city: city.slug });
        if (selectedDate) qp.set('date', selectedDate);
        navigate(`/epaper?${qp.toString()}`);
      } else if (location.pathname !== '/') {
        navigate('/');
      }
    } else {
      selectCityEdition('');
      if (location.pathname === '/epaper') {
        navigate('/epaper?section=our-pride');
      } else if (location.pathname !== '/') {
        navigate('/');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Accessibility Skip Link (UXO) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded focus:bg-[#00652E] focus:text-white focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Sticky Top Bar (Strict 3-zone contract, <=15% mobile height) */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <Link
            to="/"
            className="font-editorial text-lg sm:text-xl font-bold tracking-tight text-[#00652E] dark:text-[#4ade80] whitespace-nowrap shrink-0"
          >
            MAHEEP NEWS PORTAL
          </Link>

          <nav className="hidden lg:flex items-center gap-5" aria-label="Primary navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/national" className={navLinkClass}>
              National
            </NavLink>
            <NavLink to="/states" className={navLinkClass}>
              States &amp; UTs
            </NavLink>
            <NavLink to="/business-sports" className={navLinkClass}>
              Business
            </NavLink>
            <NavLink to="/guides" className={navLinkClass}>
              Guides
            </NavLink>
            <NavLink to="/briefing" className={navLinkClass}>
              AI &amp; Audio
            </NavLink>
            <NavLink to="/timelines" className={navLinkClass}>
              Timelines
            </NavLink>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCmdSearchOpen(true)}
              aria-label="Open quick jump search"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 hover:border-[#00652E] transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Quick Jump</span>
              <kbd className="text-[10px] font-mono-tabular opacity-70 ml-0.5">Ctrl+K</kbd>
            </button>
            <Link
              to="/epaper"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-[#00652E] text-white hover:bg-[#00451F] transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              E-Paper
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-md text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Persistent Navigation Header Bar for Edition, City & Date Switching (Desktop) */}
        {(editionSetupDone || location.pathname !== '/') && (
          <div className="hidden md:block border-t border-neutral-200/80 dark:border-neutral-800 bg-[#FBF9F5]/95 dark:bg-neutral-900/95">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Header edition switcher">
                <span className="font-semibold text-neutral-500 dark:text-neutral-400 mr-1 whitespace-nowrap">
                  Edition:
                </span>
                {HEADER_EDITION_OPTIONS.map((opt) => {
                  const active = selectedEdition === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleHeaderEditionChange(opt.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#00652E] text-white font-semibold'
                          : 'bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                      }`}
                    >
                      {opt.brand}{' '}
                      <span className={active ? 'text-[#EAF5E5]' : 'text-neutral-400'}>({opt.sub})</span>
                    </button>
                  );
                })}
                <CitySelector
                  value={selectedEdition === 'local' ? selectedLocalCity : ''}
                  stateFilter={selectedEdition === 'local' ? selectedLocalState : ''}
                  onChange={handleHeaderCityChange}
                  placeholder="City Edition"
                  variant="header"
                  ariaLabel="Select city from header"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => handleHeaderDateChange(todayIst)}
                    className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                      selectedDate === todayIst
                        ? 'bg-[#00652E] text-white'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHeaderDateChange(yesterdayIst)}
                    className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                      selectedDate === yesterdayIst
                        ? 'bg-[#00652E] text-white'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHeaderDateChange('')}
                    className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                      selectedDate === ''
                        ? 'bg-[#00652E] text-white'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
                    }`}
                  >
                    All Dates
                  </button>
                </div>

                <label className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" />
                  <input
                    aria-label="Modify selected edition date from header"
                    type="date"
                    value={selectedDate}
                    max={todayIst}
                    onChange={(e) => handleHeaderDateChange(e.target.value)}
                    className="px-2 py-0.5 text-xs font-mono-tabular rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    reopenEditionPicker();
                    if (location.pathname !== '/') navigate('/');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold text-[#00652E] dark:text-[#4ade80] hover:border-[#00652E] whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  Setup Screen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-4 space-y-4">
            {(editionSetupDone || location.pathname !== '/') && (
              <div className="p-3 rounded-lg bg-[#FBF9F5] dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                  <span>Edition, City &amp; Date</span>
                  <button
                    type="button"
                    onClick={() => {
                      reopenEditionPicker();
                      setMobileMenuOpen(false);
                      if (location.pathname !== '/') navigate('/');
                    }}
                    className="underline"
                  >
                    Open Setup Screen
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {HEADER_EDITION_OPTIONS.map((opt) => {
                    const active = selectedEdition === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          handleHeaderEditionChange(opt.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded text-left font-medium border ${
                          active
                            ? 'bg-[#00652E] text-white border-[#00652E] font-semibold'
                            : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200'
                        }`}
                      >
                        {opt.brand}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <CitySelector
                    value={selectedEdition === 'local' ? selectedLocalCity : ''}
                    stateFilter={selectedEdition === 'local' ? selectedLocalState : ''}
                    onChange={(city) => {
                      handleHeaderCityChange(city);
                      setMobileMenuOpen(false);
                    }}
                    placeholder="Choose Indian City (Our Pride)"
                    variant="inline"
                    ariaLabel="Select city in mobile menu"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Modify edition date on mobile"
                    type="date"
                    value={selectedDate}
                    max={todayIst}
                    onChange={(e) => handleHeaderDateChange(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono-tabular rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                  />
                  <button
                    type="button"
                    onClick={() => handleHeaderDateChange('')}
                    className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-medium"
                  >
                    All Dates
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search news, states, topics..."
                className="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-md bg-[#00652E] text-white text-sm font-medium"
              >
                Search
              </button>
            </form>
            <div className="grid grid-cols-2 gap-2 text-sm font-medium">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Home</Link>
              <Link to="/national" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">National</Link>
              <Link to="/states" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">States &amp; UTs</Link>
              <Link to="/business-sports" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Business &amp; Sports</Link>
              <Link to="/briefing" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Ask AI &amp; Audio</Link>
              <Link to="/guides" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Guides &amp; Videos</Link>
              <Link to="/timelines" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">News Timelines</Link>
              <Link to="/epaper" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">E-Paper Archive</Link>
              <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Contact</Link>
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-[#EAF5E5] dark:hover:bg-neutral-900">Admin Desk</Link>
            </div>
          </div>
        )}
      </header>

      {/* Newspaper Broadsheet Masthead & Utility Strip */}
      <div className="bg-[#EAF5E5]/60 dark:bg-neutral-900/70 border-b border-neutral-200 dark:border-neutral-800 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          {/* Date, Live IST Clock, Language Switch & Theme Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#00652E]/15 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300">
            <div className="flex flex-wrap items-center gap-3 font-mono-tabular">
              <span>{clock.dateLabel}</span>
              <span aria-hidden="true" className="text-neutral-400">·</span>
              <span className="font-semibold text-[#00652E] dark:text-[#4ade80]">{clock.timeLabel}</span>
              <WeatherWidget />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-0.5">
                {(['all', 'en', 'hi'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      language === lang
                        ? 'bg-[#00652E] text-white'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
                    }`}
                  >
                    {lang === 'all' ? 'All Editions' : lang === 'en' ? 'English' : 'हिन्दी'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSearch} className="hidden md:flex items-center">
                <div className="relative">
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search India news..."
                    className="w-44 lg:w-56 pl-8 pr-3 py-1.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:border-[#00652E]"
                  />
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </form>

              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label="Toggle color theme"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium hover:border-[#00652E] transition-colors"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[#00652E]" />}
                <span>{darkMode ? 'Light' : 'Dark'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSavedDrawerOpen(true)}
                aria-label="Open free saved stories and history"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium hover:border-[#00652E] transition-colors"
              >
                <Bookmark className="w-3.5 h-3.5 text-[#00652E]" />
                <span>Saved{savedCount > 0 ? ` (${savedCount})` : ''}</span>
              </button>

              <button
                type="button"
                onClick={() => setReaderDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium hover:border-[#00652E] transition-colors"
              >
                <User className="w-3.5 h-3.5 text-[#00652E]" />
                <span>{readerUser ? readerUser.name.split(' ')[0] : 'Sign In / Up'}</span>
              </button>

              <Link
                to="/admin"
                className="text-xs font-semibold text-[#00451F] dark:text-[#4ade80] hover:underline whitespace-nowrap"
              >
                Admin Desk
              </Link>
            </div>
          </div>

          {/* Masthead Title & Taglines */}
          <div className="py-4 flex flex-col md:flex-row md:items-end md:justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wider text-[#00652E] dark:text-[#4ade80]">
                सच के साथ, जनता के विश्वास के साथ
              </p>
              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-950 dark:text-white mt-0.5">
                MAHEEP NEWS PORTAL
              </h1>
            </div>
            <div className="flex flex-col md:items-end gap-1">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                News from India &amp; Beyond · All 28 States &amp; 8 Union Territories
              </p>
              {editionSetupDone && (
                <div className="md:hidden flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  <span>
                    Active Desk:{' '}
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      {getEditionMeta(selectedEdition).brand}
                    </strong>
                    {selectedDate ? ` · ${selectedDate}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      reopenEditionPicker();
                      if (location.pathname !== '/') navigate('/');
                    }}
                    className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
                  >
                    Change Edition / Date
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Breaking News Ticker */}
      {breakingNews.length > 0 && (
        <div className="bg-[#00451F] text-white border-b border-[#003417] overflow-hidden no-print">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-9">
            <span className="bg-[#DF2525] text-white text-[11px] font-bold px-2.5 py-1 rounded-sm tracking-wide shrink-0 mr-4">
              BREAKING
            </span>
            <div className="flex-1 overflow-hidden relative">
              <div className="ticker-track gap-8 text-xs sm:text-sm">
                {[...breakingNews, ...breakingNews].map((item, idx) => (
                  <Link
                    key={`${item.id}-${idx}`}
                    to={`/news/${item.slug}`}
                    className="whitespace-nowrap hover:underline text-neutral-100 inline-flex items-center gap-3"
                  >
                    <span>{item.title}</span>
                    <span aria-hidden="true" className="text-[#159B42]">•</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main id="main-content" className="flex-1 pb-16 lg:pb-0">{children}</main>

      {/* Editorial Footer */}
      <footer className="bg-[#00451F] text-neutral-100 mt-16 mb-14 lg:mb-0 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h2 className="font-editorial text-xl font-bold text-white">MAHEEP NEWS PORTAL</h2>
            <p className="mt-2 text-sm text-[#EAF5E5]">सच के साथ, जनता के विश्वास के साथ</p>
            <p className="mt-1 text-xs text-neutral-300">News from India &amp; Beyond</p>
            <p className="mt-4 text-xs text-neutral-300 leading-relaxed">
              Independent bilingual digital broadsheet serving Indian readers across all 28 States and 8 Union Territories.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">E-Paper &amp; Top Cities</h3>
            <ul className="space-y-2 text-sm text-neutral-200">
              <li><Link to="/epaper" className="hover:text-white hover:underline">Best E-Paper Site · 25-Page Broadsheet</Link></li>
              <li><Link to="/epaper?section=beacon" className="hover:text-white hover:underline">The Beacon · National &amp; 36 States</Link></li>
              <li><Link to="/epaper?section=our-pride&city=delhi" className="hover:text-white hover:underline">Our Pride · New Delhi E-Paper</Link></li>
              <li><Link to="/epaper?section=our-pride&city=mumbai" className="hover:text-white hover:underline">Our Pride · Mumbai E-Paper</Link></li>
              <li><Link to="/epaper?section=our-pride&city=lucknow" className="hover:text-white hover:underline">Our Pride · Lucknow &amp; Patna</Link></li>
              <li><Link to="/epaper?section=worldwire" className="hover:text-white hover:underline">WorldWire · 50 Countries</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Editorial &amp; Portal</h3>
            <ul className="space-y-2 text-sm text-neutral-200">
              <li><Link to="/national" className="hover:text-white hover:underline">National &amp; States</Link></li>
              <li><Link to="/business-sports" className="hover:text-white hover:underline">Business &amp; Sports</Link></li>
              <li><Link to="/guides" className="hover:text-white hover:underline">Citizen Guides &amp; Videos</Link></li>
              <li><Link to="/briefing" className="hover:text-white hover:underline">Ask MAHEEP AI &amp; Audio</Link></li>
              <li><Link to="/timelines" className="hover:text-white hover:underline">News Timelines &amp; Data</Link></li>
              <li><Link to="/authors" className="hover:text-white hover:underline">Journalists &amp; Desks</Link></li>
              <li><Link to="/search" className="hover:text-white hover:underline">Global News Search</Link></li>
              <li><Link to="/contact" className="hover:text-white hover:underline">Contact Desk</Link></li>
              <li className="text-xs text-neutral-300 pt-1">Desk Email: maheepmedia@gmail.com</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Free Morning Briefing Alert</h3>
            <p className="text-xs text-neutral-200 mb-3">
              Receive today’s free 25-page digital E-Paper edition and national dispatches in your inbox — zero paywall.
            </p>
            <form onSubmit={handleNewsletter} className="space-y-2">
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full px-3 py-2 text-sm rounded bg-white text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full py-2 px-4 rounded bg-[#159B42] hover:bg-[#128337] text-white text-sm font-semibold transition-colors"
              >
                Get Free Daily Briefing
              </button>
              {newsletterMsg && <p className="text-xs text-[#EAF5E5]">{newsletterMsg}</p>}
              {newsletterConfirmUrl && (
                <a
                  href={newsletterConfirmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs underline text-amber-200 font-semibold"
                >
                  Click to Confirm Email Alert →
                </a>
              )}
              {newsletterErr && <p className="text-xs text-red-200">{newsletterErr}</p>}
            </form>
          </div>
        </div>

        <div className="border-t border-white/15">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-neutral-300">
            <span>© {new Date().getFullYear()} Maheep News Portal · Maheep E-Paper (100% Free).</span>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/rss.xml" className="hover:text-white hover:underline">RSS Feed</a>
              <span aria-hidden="true">·</span>
              <a href="/sitemap.xml" className="hover:text-white hover:underline">Sitemap</a>
              <span aria-hidden="true">·</span>
              <a href="/sitemap-epaper.xml" className="hover:text-white hover:underline">E-Paper Sitemap</a>
              <span aria-hidden="true">·</span>
              <a href="/llms.txt" className="hover:text-white hover:underline">AI Summary (llms.txt)</a>
            </div>
            <span>IST (Asia/Kolkata) · English &amp; हिन्दी</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Quick-Navigation Bar (UXO) */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-5 text-[11px] font-medium no-print"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center py-2 gap-0.5 ${isActive ? 'text-[#00652E] dark:text-[#4ade80] font-bold' : 'text-neutral-600 dark:text-neutral-400'}`
          }
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/states"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 gap-0.5 ${isActive ? 'text-[#00652E] dark:text-[#4ade80] font-bold' : 'text-neutral-600 dark:text-neutral-400'}`
          }
        >
          <MapPin className="w-4 h-4" />
          <span>States</span>
        </NavLink>
        <NavLink
          to="/epaper"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 gap-0.5 ${isActive ? 'text-[#00652E] dark:text-[#4ade80] font-bold' : 'text-neutral-600 dark:text-neutral-400'}`
          }
        >
          <BookOpen className="w-4 h-4" />
          <span>E-Paper</span>
        </NavLink>
        <NavLink
          to="/guides"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 gap-0.5 ${isActive ? 'text-[#00652E] dark:text-[#4ade80] font-bold' : 'text-neutral-600 dark:text-neutral-400'}`
          }
        >
          <Compass className="w-4 h-4" />
          <span>Guides</span>
        </NavLink>
        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 gap-0.5 ${isActive ? 'text-[#00652E] dark:text-[#4ade80] font-bold' : 'text-neutral-600 dark:text-neutral-400'}`
          }
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
        </NavLink>
      </nav>

      {/* Back to Top UXO Button */}
      {showBackTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll back to top"
          className="fixed bottom-16 lg:bottom-6 right-4 z-40 p-2.5 rounded-full bg-[#00652E] hover:bg-[#00451F] text-white shadow-lg transition-transform hover:scale-105 no-print"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {!isOnline && (
        <div className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg no-print">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode — Cached stories &amp; pages remain readable.</span>
        </div>
      )}
      <ReaderDrawer />
      <CommandSearchModal open={cmdSearchOpen} onClose={() => setCmdSearchOpen(false)} />
      <SavedReadingDrawer open={savedDrawerOpen} onClose={() => setSavedDrawerOpen(false)} />
    </div>
  );
}
