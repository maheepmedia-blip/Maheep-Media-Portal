import { BookOpen, Menu, Moon, Search, Sun, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article } from '../types/news.ts';
import { getIndiaClockParts } from '../utils/date.ts';

interface PublicLayoutProps {
  children: React.ReactNode;
  breakingNews?: Article[];
}

export function PublicLayout({ children, breakingNews = [] }: PublicLayoutProps) {
  const { language, setLanguage, darkMode, toggleDarkMode } = usePortal();
  const [clock, setClock] = useState(() => getIndiaClockParts());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMsg, setNewsletterMsg] = useState('');
  const [newsletterErr, setNewsletterErr] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(getIndiaClockParts());
    }, 1000);
    return () => clearInterval(timer);
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
    setNewsletterErr('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewsletterErr(data.error || 'Could not subscribe.');
        return;
      }
      setNewsletterMsg(data.message || 'Subscribed to Maheep Daily Briefing.');
      setNewsletterEmail('');
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

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Sticky Top Bar (Strict 3-zone contract, <=15% mobile height) */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <Link
            to="/"
            className="font-editorial text-lg sm:text-xl font-bold tracking-tight text-[#00652E] dark:text-[#4ade80] whitespace-nowrap shrink-0"
          >
            MAHEEP NEWS PORTAL
          </Link>

          <nav className="hidden lg:flex items-center gap-6" aria-label="Primary navigation">
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
              Business &amp; Sports
            </NavLink>
            <NavLink to="/contact" className={navLinkClass}>
              Contact
            </NavLink>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
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

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-4 space-y-3">
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
            <div className="flex items-center gap-3 font-mono-tabular">
              <span>{clock.dateLabel}</span>
              <span aria-hidden="true" className="text-neutral-400">·</span>
              <span className="font-semibold text-[#00652E] dark:text-[#4ade80]">{clock.timeLabel}</span>
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
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              News from India &amp; Beyond · All 28 States &amp; 8 Union Territories
            </p>
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
      <main className="flex-1">{children}</main>

      {/* Editorial Footer */}
      <footer className="bg-[#00451F] text-neutral-100 mt-16 no-print">
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
            <h3 className="text-sm font-semibold text-white mb-3">Sections</h3>
            <ul className="space-y-2 text-sm text-neutral-200">
              <li><Link to="/national" className="hover:text-white hover:underline">National News</Link></li>
              <li><Link to="/states" className="hover:text-white hover:underline">States &amp; Union Territories</Link></li>
              <li><Link to="/business-sports" className="hover:text-white hover:underline">Business &amp; Markets</Link></li>
              <li><Link to="/business-sports?tab=sports" className="hover:text-white hover:underline">Sports Coverage</Link></li>
              <li><Link to="/epaper" className="hover:text-white hover:underline">Daily E-Paper &amp; PDF Archive</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Editorial &amp; Portal</h3>
            <ul className="space-y-2 text-sm text-neutral-200">
              <li><Link to="/search" className="hover:text-white hover:underline">Global News Search</Link></li>
              <li><Link to="/contact" className="hover:text-white hover:underline">Contact &amp; Consultation</Link></li>
              <li><Link to="/admin" className="hover:text-white hover:underline">Editorial Admin Dashboard</Link></li>
              <li className="text-xs text-neutral-300 pt-1">Desk Email: maheepmedia@gmail.com</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Daily Briefing Newsletter</h3>
            <p className="text-xs text-neutral-200 mb-3">
              Receive the morning digital edition and key national dispatches directly in your inbox.
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
                Subscribe Free
              </button>
              {newsletterMsg && <p className="text-xs text-[#EAF5E5]">{newsletterMsg}</p>}
              {newsletterErr && <p className="text-xs text-red-200">{newsletterErr}</p>}
            </form>
          </div>
        </div>

        <div className="border-t border-white/15">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-300">
            <span>© {new Date().getFullYear()} Maheep News Portal. All rights reserved.</span>
            <span>Timezone: Asia/Kolkata (IST) · Bilingual Edition (Hindi / English)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
