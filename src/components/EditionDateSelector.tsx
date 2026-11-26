import { ArrowLeft, ArrowRight, BookOpen, Calendar, Globe, Landmark, MapPin, RotateCcw } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_DESKS_META, EDITION_OPTIONS, type NewsEdition, getEditionMeta, usePortal } from '../context/PortalContext.tsx';
import type { CityItem, StateItem } from '../types/news.ts';
import { CitySelector } from './CitySelector.tsx';

interface EditionDateRow {
  date: string;
  count: number;
}

interface EditionDatesResponse {
  edition: NewsEdition;
  todayIst: string;
  yesterdayIst: string;
  dates: EditionDateRow[];
}

function formatShortIstDate(dateStr: string): string {
  if (!dateStr) return 'All Recent Dates';
  const parsed = new Date(`${dateStr}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function getEditionIcon(id: NewsEdition, className = 'w-5 h-5') {
  if (id === 'national') return <Landmark className={className} />;
  if (id === 'international') return <Globe className={className} />;
  return <MapPin className={className} />;
}

interface EditionDateSelectorProps {
  states?: StateItem[];
}

export function EditionDateSelector({ states = [] }: EditionDateSelectorProps) {
  const {
    language,
    cities,
    selectedEdition,
    selectedDate,
    selectedLocalState,
    selectedLocalCity,
    editionSetupDone,
    setEditionAndDate,
    setSelectedEdition,
    setSelectedDate,
    setSelectedLocalState,
    selectCityEdition,
    reopenEditionPicker,
  } = usePortal();

  const [step, setStep] = useState<1 | 2>(() =>
    selectedEdition !== 'all' && !editionSetupDone ? 2 : 1,
  );
  const [draftEdition, setDraftEdition] = useState<NewsEdition>(
    selectedEdition !== 'all' ? selectedEdition : 'national',
  );
  const [draftLocalState, setDraftLocalState] = useState<string>(selectedLocalState);
  const [draftLocalCity, setDraftLocalCity] = useState<string>(selectedLocalCity);
  const [customDate, setCustomDate] = useState<string>(selectedDate);
  const [datesInfo, setDatesInfo] = useState<EditionDatesResponse | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);

  // Keep local custom date synced with active selectedDate
  useEffect(() => {
    setCustomDate(selectedDate);
  }, [selectedDate]);

  // Reset step to 1 whenever guided picker is reopened
  useEffect(() => {
    if (!editionSetupDone) {
      setStep(1);
      setDraftEdition(selectedEdition !== 'all' ? selectedEdition : 'national');
      setDraftLocalState(selectedLocalState);
      setDraftLocalCity(selectedLocalCity);
    }
  }, [editionSetupDone]);

  // Fetch real available IST dates for whichever edition is being previewed or active
  const queryEdition = editionSetupDone ? selectedEdition : draftEdition;
  const queryState = editionSetupDone ? selectedLocalState : draftLocalState;
  const queryCity = editionSetupDone ? selectedLocalCity : draftLocalCity;

  const quickSelectCities = useMemo(() => {
    const slugs = ['mumbai', 'delhi', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'pune', 'jaipur', 'lucknow'];
    const map = new Map(cities.map((c) => [c.slug, c]));
    return slugs.map((s) => map.get(s)).filter((c): c is CityItem => Boolean(c));
  }, [cities]);

  useEffect(() => {
    let active = true;
    setLoadingDates(true);
    const params = new URLSearchParams({ edition: queryEdition });
    if (language !== 'all') params.set('lang', language);
    if (queryEdition === 'local' && queryState) params.set('state', queryState);
    if (queryEdition === 'local' && queryCity) params.set('city', queryCity);

    fetch(`/api/edition-dates?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: EditionDatesResponse | null) => {
        if (active && json) {
          setDatesInfo(json);
          if (!editionSetupDone && !customDate) {
            setCustomDate(json.dates?.[0]?.date || json.todayIst);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingDates(false);
      });

    return () => {
      active = false;
    };
  }, [queryEdition, queryState, queryCity, language, editionSetupDone]);

  const handleChooseEditionInWizard = (edition: NewsEdition) => {
    setDraftEdition(edition);
    if (edition !== 'local') {
      setDraftLocalState('');
      setDraftLocalCity('');
    }
    setStep(2);
  };

  const handleConfirmDateInWizard = (pickedDate: string) => {
    setEditionAndDate(
      draftEdition,
      pickedDate,
      draftEdition === 'local' ? draftLocalState : '',
      draftEdition === 'local' ? draftLocalCity : '',
    );
  };

  const todayIst = datesInfo?.todayIst || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const yesterdayIst =
    datesInfo?.yesterdayIst ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86_400_000));

  const countForDate = (d: string) => datesInfo?.dates?.find((item) => item.date === d)?.count ?? 0;

  if (!editionSetupDone) {
    const draftMeta = getEditionMeta(draftEdition);

    return (
      <section
        aria-label="Edition and date selection"
        className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-[#FBF9F5] dark:bg-neutral-900 p-6 sm:p-10"
      >
        {/* Clean Editorial Step Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3 text-xs font-medium">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                step === 1
                  ? 'bg-[#00652E] text-white font-semibold'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:border-[#00652E]'
              }`}
            >
              <span className="font-mono-tabular">01</span>
              <span>Select Edition</span>
            </button>
            <span aria-hidden="true" className="text-neutral-400">
              →
            </span>
            <button
              type="button"
              onClick={() => setStep(2)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                step === 2
                  ? 'bg-[#00652E] text-white font-semibold'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:border-[#00652E]'
              }`}
            >
              <span className="font-mono-tabular">02</span>
              <span>Select Date</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setEditionAndDate('all', '', '')}
            className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
          >
            Skip &amp; browse all desks →
          </button>
        </div>

        {step === 1 ? (
          <div className="pt-7 space-y-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-[#00652E] dark:text-[#4ade80]">
                Maheep Newsstand · Step 1 of 2
              </p>
              <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-white mt-1.5">
                Which edition would you like to read today?
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Choose a news desk below, then pick your edition date. You can switch editions or change the date at any time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {EDITION_OPTIONS.map((item) => {
                const isPreviouslySelected = selectedEdition === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleChooseEditionInWizard(item.id)}
                    className={`group text-left rounded-lg border p-6 bg-white dark:bg-neutral-950 transition-all flex flex-col justify-between gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00652E] ${
                      isPreviouslySelected
                        ? 'border-[#00652E] ring-1 ring-[#00652E]'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/50 text-[#00652E] dark:text-[#4ade80]">
                          {getEditionIcon(item.id)}
                        </span>
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          {item.label}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white group-hover:text-[#00652E] dark:group-hover:text-[#4ade80] transition-colors">
                          {item.brand}
                        </h3>
                        <p className="text-xs font-medium text-[#00652E] dark:text-[#4ade80] mt-0.5">
                          {item.tagline}
                        </p>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                      <span>Select {item.brand}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {cities.length > 0 && (
              <div className="pt-5 border-t border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                    City Selector (Our Pride · {cities.length} Cities):
                  </span>
                  <CitySelector
                    value={draftEdition === 'local' ? draftLocalCity : ''}
                    onChange={(city) => {
                      setDraftEdition('local');
                      if (city) {
                        setDraftLocalState(city.state_slug || '');
                        setDraftLocalCity(city.slug);
                        setStep(2);
                      } else {
                        setDraftLocalState('');
                        setDraftLocalCity('');
                      }
                    }}
                    placeholder="Choose your city..."
                    variant="inline"
                    ariaLabel="Jump directly to a city edition"
                  />
                </div>

                {quickSelectCities.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {quickSelectCities.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => {
                          setDraftEdition('local');
                          setDraftLocalState(ct.state_slug || '');
                          setDraftLocalCity(ct.slug);
                          setStep(2);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                          draftEdition === 'local' && draftLocalCity === ct.slug
                            ? 'bg-[#00652E] text-white border-[#00652E]'
                            : 'bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                        }`}
                      >
                        {ct.name.replace(' (town)', '')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="pt-7 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                  {getEditionIcon(draftEdition, 'w-4 h-4')}
                  <span>
                    {draftMeta.brand} · {draftMeta.label}
                  </span>
                </div>
                <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-white mt-1.5">
                  Choose Edition Date
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  Pick today’s issue, an earlier archive date, or browse all recent dispatches from {draftMeta.brand}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-[#00652E] whitespace-nowrap self-start"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Edition
              </button>
            </div>

            {draftEdition === 'local' && (states.length > 0 || cities.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                {states.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="wizard-local-state"
                      className="text-xs font-semibold text-neutral-700 dark:text-neutral-200"
                    >
                      State / Union Territory (Optional)
                    </label>
                    <select
                      id="wizard-local-state"
                      value={draftLocalState}
                      onChange={(e) => {
                        setDraftLocalState(e.target.value);
                        setDraftLocalCity('');
                      }}
                      className="px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                    >
                      <option value="">All 28 States &amp; 8 Union Territories</option>
                      {states.map((st) => (
                        <option key={st.id} value={st.slug}>
                          {st.name} ({st.article_count ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {cities.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                      City Edition · Our Pride ({cities.length} Cities)
                    </span>
                    <CitySelector
                      value={draftLocalCity}
                      stateFilter={draftLocalState}
                      onChange={(city) => {
                        if (city) {
                          setDraftLocalCity(city.slug);
                          if (city.state_slug) setDraftLocalState(city.state_slug);
                        } else {
                          setDraftLocalCity('');
                        }
                      }}
                      placeholder="All Cities in Region"
                      variant="inline"
                      ariaLabel="Filter Our Pride edition by city"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Quick Date Presets */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Available Issues
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => handleConfirmDateInWizard(todayIst)}
                  className="text-left p-4 rounded-lg border border-[#00652E] bg-white dark:bg-neutral-950 hover:bg-[#EAF5E5]/60 dark:hover:bg-[#00451F]/30 transition-colors"
                >
                  <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">Today’s Issue</div>
                  <div className="font-mono-tabular text-sm font-bold text-neutral-950 dark:text-white mt-1">
                    {formatShortIstDate(todayIst)}
                  </div>
                  <div className="font-mono-tabular text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {loadingDates ? 'Checking...' : `${countForDate(todayIst)} stories`}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmDateInWizard(yesterdayIst)}
                  className="text-left p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-[#00652E] transition-colors"
                >
                  <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">Yesterday</div>
                  <div className="font-mono-tabular text-sm font-bold text-neutral-950 dark:text-white mt-1">
                    {formatShortIstDate(yesterdayIst)}
                  </div>
                  <div className="font-mono-tabular text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {loadingDates ? 'Checking...' : `${countForDate(yesterdayIst)} stories`}
                  </div>
                </button>

                {(datesInfo?.dates || [])
                  .filter((d) => d.date !== todayIst && d.date !== yesterdayIst)
                  .slice(0, 1)
                  .map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => handleConfirmDateInWizard(d.date)}
                      className="text-left p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-[#00652E] transition-colors"
                    >
                      <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">Earlier Archive</div>
                      <div className="font-mono-tabular text-sm font-bold text-neutral-950 dark:text-white mt-1">
                        {formatShortIstDate(d.date)}
                      </div>
                      <div className="font-mono-tabular text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {d.count} stories
                      </div>
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() => handleConfirmDateInWizard('')}
                  className="text-left p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-[#00652E] transition-colors"
                >
                  <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">Rolling Feed</div>
                  <div className="text-sm font-bold text-neutral-950 dark:text-white mt-1">
                    All Recent Dates
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Latest {draftMeta.brand} dispatches
                  </div>
                </button>
              </div>
            </div>

            {/* Custom Date Calendar Picker */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmDateInWizard(customDate);
              }}
              className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <label
                htmlFor="wizard-date-picker"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
                Or pick any date:
              </label>
              <input
                id="wizard-date-picker"
                type="date"
                value={customDate}
                max={todayIst}
                onChange={(e) => setCustomDate(e.target.value)}
                className="px-3 py-2 text-sm font-mono-tabular rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-sm font-semibold whitespace-nowrap transition-colors"
              >
                Read {draftMeta.brand} →
              </button>
            </form>
          </div>
        )}
      </section>
    );
  }

  // Persistent Live Switcher Toolbar (shown after selection so Edition & Date can be changed anytime)
  const activeMeta = getEditionMeta(selectedEdition);
  const allSwitcherOptions: readonly { id: NewsEdition; label: string; sub: string }[] = [
    { id: 'national', label: 'The Beacon', sub: 'National' },
    { id: 'international', label: 'WorldWire', sub: 'International' },
    { id: 'local', label: 'Our Pride', sub: 'Local' },
    { id: 'all', label: ALL_DESKS_META.brand, sub: 'Full Paper' },
  ];

  return (
    <section
      aria-label="Active edition and date controls"
      className="border border-neutral-200 dark:border-neutral-800 rounded-lg bg-[#FBF9F5] dark:bg-neutral-900 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-editorial text-base font-bold text-neutral-950 dark:text-white">
            {selectedEdition !== 'all' && getEditionIcon(selectedEdition, 'w-4 h-4 text-[#00652E] dark:text-[#4ade80]')}
            {activeMeta.brand}
          </span>
          <span aria-hidden="true" className="text-neutral-400">·</span>
          <span className="font-medium text-neutral-600 dark:text-neutral-300">{activeMeta.label}</span>
          <span aria-hidden="true" className="text-neutral-400">·</span>
          <span className="font-mono-tabular font-semibold text-[#00652E] dark:text-[#4ade80]">
            {selectedDate ? formatShortIstDate(selectedDate) : 'All Recent Dates'}
          </span>
        </div>

        {/* Desktop Local City/State Filter OR Quick E-Paper & Setup action */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedEdition === 'local' && states.length > 0 && (
            <select
              aria-label="Filter local news by state or union territory"
              value={selectedLocalState}
              onChange={(e) => setSelectedLocalState(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 max-w-[165px]"
            >
              <option value="">All States &amp; UTs</option>
              {states.map((st) => (
                <option key={st.id} value={st.slug}>
                  {st.name}
                </option>
              ))}
            </select>
          )}

          {cities.length > 0 && (
            <>
              <CitySelector
                value={selectedEdition === 'local' ? selectedLocalCity : ''}
                stateFilter={selectedEdition === 'local' ? selectedLocalState : ''}
                onChange={(city) => selectCityEdition(city?.slug || '', city?.state_slug || '')}
                placeholder="City Selector"
                variant="inline"
                align="right"
                ariaLabel="Filter news by Indian city"
              />
              {selectedEdition === 'local' && (
                <Link
                  to={`/epaper?section=our-pride${selectedLocalCity ? `&city=${encodeURIComponent(selectedLocalCity)}` : ''}${selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : ''}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/40 text-[#00652E] dark:text-[#4ade80] border border-[#00652E]/30 hover:bg-[#00652E] hover:text-white transition-colors whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  City E-Paper
                </Link>
              )}
            </>
          )}

          <button
            type="button"
            onClick={reopenEditionPicker}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:underline whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Change Desk / Date
          </button>
        </div>
      </div>

      {/* Mobile-only quick edition & date controls (desktop uses sticky header controls) */}
      <div className="md:hidden pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Switch news edition on mobile">
          {allSwitcherOptions.map((opt) => {
            const active = selectedEdition === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedEdition(opt.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#00652E] text-white font-semibold'
                    : 'bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-0.5">
            <button
              type="button"
              onClick={() => setSelectedDate(todayIst)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                selectedDate === todayIst
                  ? 'bg-[#00652E] text-white'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayIst)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                selectedDate === yesterdayIst
                  ? 'bg-[#00652E] text-white'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                selectedDate === ''
                  ? 'bg-[#00652E] text-white'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-[#00652E]'
              }`}
            >
              All Dates
            </button>
          </div>

          <input
            aria-label="Pick specific edition date"
            type="date"
            value={selectedDate}
            max={todayIst}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono-tabular rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200"
          />
        </div>
      </div>
    </section>
  );
}
