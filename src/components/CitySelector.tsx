import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePortal } from '../context/PortalContext.tsx';
import type { CityItem } from '../types/news.ts';

const TOP_CITY_SLUGS = [
  'mumbai',
  'delhi',
  'bengaluru',
  'hyderabad',
  'chennai',
  'kolkata',
  'pune',
  'jaipur',
  'lucknow',
  'patna',
];

interface CitySelectorProps {
  value: string;
  onChange: (city: CityItem | null) => void;
  stateFilter?: string;
  placeholder?: string;
  variant?: 'header' | 'inline';
  align?: 'left' | 'right';
  ariaLabel?: string;
}

export function CitySelector({
  value,
  onChange,
  stateFilter = '',
  placeholder = 'Select City',
  variant = 'inline',
  align = 'left',
  ariaLabel = 'Select Indian city',
}: CitySelectorProps) {
  const { cities } = usePortal();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  const activeCity = useMemo(
    () => cities.find((c) => c.slug === value) || null,
    [cities, value],
  );

  const quickCities = useMemo(() => {
    const bySlug = new Map(cities.map((c) => [c.slug, c]));
    return TOP_CITY_SLUGS.map((s) => bySlug.get(s)).filter((c): c is CityItem => Boolean(c));
  }, [cities]);

  const filteredCities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = stateFilter ? cities.filter((c) => c.state_slug === stateFilter) : cities;
    if (!q) return base.slice(0, 120);
    return base
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.state_name.toLowerCase().includes(q) ||
          (c.state_code || '').toLowerCase().includes(q),
      )
      .slice(0, 120);
  }, [cities, stateFilter, query]);

  const activeLabel = activeCity ? activeCity.name.replace(' (town)', '') : placeholder;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          variant === 'header'
            ? `inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00652E] ${
                activeCity
                  ? 'bg-[#00652E] text-white border-[#00652E] font-semibold'
                  : 'bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]'
              }`
            : `inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00652E] ${
                activeCity
                  ? 'bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] border-[#00652E]/50 font-semibold'
                  : 'bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:border-[#00652E]'
              }`
        }
      >
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[140px]">{activeLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="City selector"
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1.5 w-72 sm:w-80 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 shadow-xl z-50 overflow-hidden`}
        >
          <div className="p-2.5 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search 339 cities or states..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#00652E]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear city search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!query && quickCities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="px-2 py-1 text-[11px] font-semibold rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-[#00652E] whitespace-nowrap"
                  >
                    All Cities
                  </button>
                )}
                {quickCities.slice(0, 6).map((ct) => {
                  const selected = ct.slug === value;
                  return (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => {
                        onChange(ct);
                        setOpen(false);
                      }}
                      className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                        selected
                          ? 'bg-[#00652E] text-white border-[#00652E]'
                          : 'bg-[#FBF9F5] dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                      }`}
                    >
                      {ct.name.replace(' (town)', '')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div role="listbox" className="max-h-60 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-900">
            {value && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:bg-[#EAF5E5]/60 dark:hover:bg-neutral-900 flex items-center justify-between"
              >
                <span>All Cities {stateFilter ? 'in Selected State' : '(339 Cities)'}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {filteredCities.length === 0 ? (
              <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400 text-center">
                No matching Indian city found.
              </div>
            ) : (
              filteredCities.map((ct) => {
                const selected = ct.slug === value;
                return (
                  <button
                    key={ct.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(ct);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      selected
                        ? 'bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] font-semibold'
                        : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-mono-tabular text-neutral-400 mr-1.5">#{ct.rank}</span>
                      {ct.name.replace(' (town)', '')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
                      <span>{ct.state_code || ct.state_name}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80]" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
