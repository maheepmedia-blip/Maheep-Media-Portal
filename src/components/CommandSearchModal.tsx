import { ArrowRight, BookOpen, Globe2, Landmark, MapPin, Newspaper, Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COUNTRIES_DIRECTORY } from '../../shared/countries.ts';
import { usePortal } from '../context/PortalContext.tsx';
import type { Article, StateItem } from '../types/news.ts';

interface CommandSearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface QuickHit {
  key: string;
  label: string;
  sublabel: string;
  to: string;
  group: 'Desks & E-Paper' | 'Our Pride Cities' | 'States & UTs' | 'WorldWire Countries' | 'Published Articles';
}

const PORTAL_DESKS: QuickHit[] = [
  {
    key: 'desk-epaper',
    label: 'Daily 25-Page Broadsheet E-Paper',
    sublabel: 'Read today’s full Hindi & English edition + A4 PDF export',
    to: '/epaper',
    group: 'Desks & E-Paper',
  },
  {
    key: 'desk-beacon',
    label: 'The Beacon · National & 36 States E-Paper',
    sublabel: '300 verified dispatches across India Parliament & all States/UTs',
    to: '/epaper?section=beacon',
    group: 'Desks & E-Paper',
  },
  {
    key: 'desk-pride',
    label: 'Our Pride · 339 Indian Cities E-Paper',
    sublabel: '300 hyperlocal reports per city across India',
    to: '/epaper?section=our-pride',
    group: 'Desks & E-Paper',
  },
  {
    key: 'desk-world',
    label: 'WorldWire · 50 Countries E-Paper',
    sublabel: '300 global reports per nation across 50 countries',
    to: '/epaper?section=worldwire',
    group: 'Desks & E-Paper',
  },
  {
    key: 'desk-guides',
    label: 'Citizen Guides, Fact-Checks & Videos',
    sublabel: 'Free civic checklists and explainers',
    to: '/guides',
    group: 'Desks & E-Paper',
  },
  {
    key: 'desk-briefing',
    label: '60s Audio Briefing & Ask AI',
    sublabel: 'Daily spoken news roundup and Q&A',
    to: '/briefing',
    group: 'Desks & E-Paper',
  },
];

export function CommandSearchModal({ open, onClose }: CommandSearchModalProps) {
  const { cities, language } = usePortal();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [states, setStates] = useState<StateItem[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchingArticles, setSearchingArticles] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
    if (states.length === 0) {
      fetch('/api/states')
        .then((r) => (r.ok ? r.json() : { states: [] }))
        .then((json) => setStates(json.states || []))
        .catch(() => {});
    }
  }, [open, states.length]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setArticles([]);
      setSearchingArticles(false);
      return;
    }
    const controller = new AbortController();
    setSearchingArticles(true);
    const timer = window.setTimeout(() => {
      const qp = new URLSearchParams({ q: trimmed, limit: '5' });
      if (language !== 'all') qp.set('language', language);
      fetch(`/api/articles?${qp.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { articles: [] }))
        .then((json) => setArticles(json.articles || []))
        .catch(() => {})
        .finally(() => setSearchingArticles(false));
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, language]);

  const hits: QuickHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: QuickHit[] = [];

    if (!q) {
      out.push(...PORTAL_DESKS);
      for (const c of cities.slice(0, 4)) {
        out.push({
          key: `city-${c.slug}`,
          label: `${c.name.replace(' (town)', '')} E-Paper`,
          sublabel: `Our Pride Local Edition · ${c.state_name}`,
          to: `/epaper?section=our-pride&city=${encodeURIComponent(c.slug)}`,
          group: 'Our Pride Cities',
        });
      }
      return out;
    }

    for (const art of articles.slice(0, 5)) {
      out.push({
        key: `art-${art.id}`,
        label: art.title,
        sublabel: `${art.category_name || 'News'}${art.state_name ? ` · ${art.state_name}` : ''}`,
        to: `/news/${art.slug}`,
        group: 'Published Articles',
      });
    }

    for (const c of cities) {
      if (
        c.name.toLowerCase().includes(q) ||
        c.state_name.toLowerCase().includes(q) ||
        c.slug.includes(q)
      ) {
        out.push({
          key: `city-${c.slug}`,
          label: `${c.name.replace(' (town)', '')} City E-Paper`,
          sublabel: `Our Pride · ${c.state_name} (300 local dispatches)`,
          to: `/epaper?section=our-pride&city=${encodeURIComponent(c.slug)}`,
          group: 'Our Pride Cities',
        });
        if (out.filter((x) => x.group === 'Our Pride Cities').length >= 5) break;
      }
    }

    for (const st of states) {
      if (st.name.toLowerCase().includes(q) || st.code.toLowerCase() === q) {
        out.push({
          key: `state-${st.slug}`,
          label: `${st.name} (${st.code})`,
          sublabel: 'The Beacon State Edition & Regional News',
          to: `/epaper?section=beacon&scopeType=state&slug=${encodeURIComponent(st.slug)}`,
          group: 'States & UTs',
        });
        if (out.filter((x) => x.group === 'States & UTs').length >= 4) break;
      }
    }

    for (const country of COUNTRIES_DIRECTORY) {
      if (
        country.name.toLowerCase().includes(q) ||
        country.hiName.includes(query.trim()) ||
        country.capital.toLowerCase().includes(q)
      ) {
        out.push({
          key: `country-${country.slug}`,
          label: `${country.name} (${country.hiName})`,
          sublabel: `WorldWire · ${country.region} (300 dispatches)`,
          to: `/epaper?section=worldwire&scopeType=country&slug=${encodeURIComponent(country.slug)}`,
          group: 'WorldWire Countries',
        });
        if (out.filter((x) => x.group === 'WorldWire Countries').length >= 4) break;
      }
    }

    for (const d of PORTAL_DESKS) {
      if (d.label.toLowerCase().includes(q) || d.sublabel.toLowerCase().includes(q)) {
        out.push(d);
      }
    }

    return out;
  }, [query, articles, cities, states]);

  useEffect(() => {
    setActiveIndex(0);
  }, [hits.length]);

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(Math.max(0, hits.length - 1), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[activeIndex]) {
        go(hits[activeIndex].to);
      } else if (query.trim()) {
        go(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  const renderGroupIcon = (group: QuickHit['group']) => {
    if (group === 'Our Pride Cities') return <MapPin className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />;
    if (group === 'States & UTs') return <Landmark className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />;
    if (group === 'WorldWire Countries') return <Globe2 className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />;
    if (group === 'Published Articles') return <Newspaper className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />;
    return <BookOpen className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-start justify-center p-4 pt-16 sm:pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global portal and E-Paper search"
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <Search className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any Indian city, state, country, E-Paper edition, or headline..."
            className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick search"
            className="p-1 rounded text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-900">
          {searchingArticles && query.trim().length >= 2 && (
            <div className="px-4 py-2 text-xs text-neutral-500">Searching stories &amp; editions...</div>
          )}

          {hits.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                No direct match for &ldquo;{query}&rdquo;.
              </p>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
                >
                  Search Full Archive for &ldquo;{query.trim()}&rdquo; <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            hits.map((hit, idx) => (
              <button
                key={hit.key}
                type="button"
                onClick={() => go(hit.to)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  idx === activeIndex
                    ? 'bg-[#EAF5E5]/80 dark:bg-[#00451F]/40'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {renderGroupIcon(hit.group)}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {hit.label}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {hit.group} · {hit.sublabel}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
          <span>↑↓ Navigate · Enter Open · Esc Close</span>
          {query.trim() && (
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              className="font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline"
            >
              Full Archive Search →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
