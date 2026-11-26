import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AdminUser, ReaderUser } from '../types/news.ts';

export type LanguageFilter = 'all' | 'en' | 'hi';
export type FontSizeScale = 'sm' | 'md' | 'lg';
export type NewsEdition = 'national' | 'international' | 'local' | 'all';

export interface EditionMeta {
  id: NewsEdition;
  brand: string;
  label: string;
  tagline: string;
  description: string;
}

export const EDITION_OPTIONS: readonly EditionMeta[] = [
  {
    id: 'national',
    brand: 'The Beacon',
    label: 'National News',
    tagline: 'India · Parliament & Policy',
    description: 'Union legislation, governance, courts, defence, and national affairs across India.',
  },
  {
    id: 'international',
    brand: 'WorldWire',
    label: 'International News',
    tagline: 'Global · World & Diplomacy',
    description: 'International diplomacy, global trade, geopolitics, and world dispatches.',
  },
  {
    id: 'local',
    brand: 'Our Pride',
    label: 'Local News',
    tagline: 'Regional · Every City & State',
    description: 'Civic updates, grassroots reporting, and local stories from Indian cities across 28 states & 8 UTs.',
  },
];

export const ALL_DESKS_META: EditionMeta = {
  id: 'all',
  brand: 'All Desks',
  label: 'Full Broadsheet',
  tagline: 'Complete Edition',
  description: 'Combined National, International, State, Business, Sports, and Technology coverage.',
};

export function getEditionMeta(edition: NewsEdition): EditionMeta {
  return EDITION_OPTIONS.find((item) => item.id === edition) || ALL_DESKS_META;
}

const SESSION_PREF_KEY = 'maheep_edition_pref_v1';

interface StoredEditionPref {
  edition: NewsEdition;
  date: string;
  localState: string;
  localCity: string;
  done: boolean;
}

function readStoredEditionPref(): StoredEditionPref {
  try {
    const raw = sessionStorage.getItem(SESSION_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredEditionPref>;
      const validEd =
        parsed.edition === 'national' ||
        parsed.edition === 'international' ||
        parsed.edition === 'local' ||
        parsed.edition === 'all'
          ? parsed.edition
          : 'all';
      return {
        edition: validEd,
        date: typeof parsed.date === 'string' ? parsed.date : '',
        localState: typeof parsed.localState === 'string' ? parsed.localState : '',
        localCity: typeof parsed.localCity === 'string' ? parsed.localCity : '',
        done: Boolean(parsed.done),
      };
    }
  } catch {
    // Ignore storage failure
  }
  return { edition: 'all', date: '', localState: '', localCity: '', done: false };
}

function writeStoredEditionPref(pref: StoredEditionPref): void {
  try {
    sessionStorage.setItem(SESSION_PREF_KEY, JSON.stringify(pref));
  } catch {
    // Ignore storage failure
  }
}

interface PortalContextValue {
  language: LanguageFilter;
  setLanguage: (lang: LanguageFilter) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  fontSize: FontSizeScale;
  setFontSize: (size: FontSizeScale) => void;
  selectedEdition: NewsEdition;
  selectedDate: string;
  selectedLocalState: string;
  selectedLocalCity: string;
  editionSetupDone: boolean;
  setEditionAndDate: (edition: NewsEdition, date: string, localState?: string, localCity?: string) => void;
  setSelectedEdition: (edition: NewsEdition) => void;
  setSelectedDate: (date: string) => void;
  setSelectedLocalState: (stateSlug: string) => void;
  setSelectedLocalCity: (citySlug: string) => void;
  reopenEditionPicker: () => void;
  adminToken: string | null;
  adminUser: AdminUser | null;
  setAdminSession: (token: string | null, user: AdminUser | null) => void;
  logoutAdmin: () => void;
  readerToken: string | null;
  readerUser: ReaderUser | null;
  setReaderSession: (token: string | null, user: ReaderUser | null) => void;
  logoutReader: () => void;
  readerDrawerOpen: boolean;
  setReaderDrawerOpen: (open: boolean) => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [fontSize, setFontSizeState] = useState<FontSizeScale>(() => {
    try {
      const saved = localStorage.getItem('maheep_font_size');
      if (saved === 'sm' || saved === 'md' || saved === 'lg') return saved;
    } catch {
      // Ignore storage failure
    }
    return 'md';
  });

  const [initialPref] = useState<StoredEditionPref>(() => readStoredEditionPref());
  const [selectedEdition, setSelectedEditionState] = useState<NewsEdition>(initialPref.edition);
  const [selectedDate, setSelectedDateState] = useState<string>(initialPref.date);
  const [selectedLocalState, setSelectedLocalStateState] = useState<string>(initialPref.localState);
  const [selectedLocalCity, setSelectedLocalCityState] = useState<string>(initialPref.localCity);
  const [editionSetupDone, setEditionSetupDone] = useState<boolean>(initialPref.done);

  // Session tokens stay strictly in React memory (never persisted in localStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [readerToken, setReaderToken] = useState<string | null>(null);
  const [readerUser, setReaderUser] = useState<ReaderUser | null>(null);
  const [readerDrawerOpen, setReaderDrawerOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const setFontSize = (size: FontSizeScale) => {
    setFontSizeState(size);
    try {
      localStorage.setItem('maheep_font_size', size);
    } catch {
      // Ignore storage failure
    }
  };

  const setEditionAndDate = (edition: NewsEdition, date: string, localState?: string, localCity?: string) => {
    const nextState = localState !== undefined ? localState : edition === 'local' ? selectedLocalState : '';
    const nextCity = localCity !== undefined ? localCity : edition === 'local' ? selectedLocalCity : '';
    setSelectedEditionState(edition);
    setSelectedDateState(date);
    setSelectedLocalStateState(nextState);
    setSelectedLocalCityState(nextCity);
    setEditionSetupDone(true);
    writeStoredEditionPref({ edition, date, localState: nextState, localCity: nextCity, done: true });
  };

  const setSelectedEdition = (edition: NewsEdition) => {
    const nextState = edition === 'local' ? selectedLocalState : '';
    const nextCity = edition === 'local' ? selectedLocalCity : '';
    setSelectedEditionState(edition);
    setSelectedLocalStateState(nextState);
    setSelectedLocalCityState(nextCity);
    setEditionSetupDone(true);
    writeStoredEditionPref({ edition, date: selectedDate, localState: nextState, localCity: nextCity, done: true });
  };

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);
    setEditionSetupDone(true);
    writeStoredEditionPref({
      edition: selectedEdition,
      date,
      localState: selectedLocalState,
      localCity: selectedLocalCity,
      done: true,
    });
  };

  const setSelectedLocalState = (stateSlug: string) => {
    setSelectedLocalStateState(stateSlug);
    setSelectedLocalCityState('');
    setEditionSetupDone(true);
    writeStoredEditionPref({
      edition: selectedEdition,
      date: selectedDate,
      localState: stateSlug,
      localCity: '',
      done: true,
    });
  };

  const setSelectedLocalCity = (citySlug: string) => {
    setSelectedLocalCityState(citySlug);
    setEditionSetupDone(true);
    writeStoredEditionPref({
      edition: selectedEdition,
      date: selectedDate,
      localState: selectedLocalState,
      localCity: citySlug,
      done: true,
    });
  };

  const reopenEditionPicker = () => {
    setEditionSetupDone(false);
    writeStoredEditionPref({
      edition: selectedEdition,
      date: selectedDate,
      localState: selectedLocalState,
      localCity: selectedLocalCity,
      done: false,
    });
  };

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const setAdminSession = (token: string | null, user: AdminUser | null) => {
    setAdminToken(token);
    setAdminUser(user);
  };

  const logoutAdmin = () => {
    setAdminToken(null);
    setAdminUser(null);
  };

  const setReaderSession = (token: string | null, user: ReaderUser | null) => {
    setReaderToken(token);
    setReaderUser(user);
    if (user?.preferred_language) {
      setLanguage(user.preferred_language);
    }
    if (user?.font_size) {
      setFontSizeState(user.font_size);
    }
  };

  const logoutReader = () => {
    setReaderToken(null);
    setReaderUser(null);
  };

  return (
    <PortalContext.Provider
      value={{
        language,
        setLanguage,
        darkMode,
        toggleDarkMode,
        fontSize,
        setFontSize,
        selectedEdition,
        selectedDate,
        selectedLocalState,
        selectedLocalCity,
        editionSetupDone,
        setEditionAndDate,
        setSelectedEdition,
        setSelectedDate,
        setSelectedLocalState,
        setSelectedLocalCity,
        reopenEditionPicker,
        adminToken,
        adminUser,
        setAdminSession,
        logoutAdmin,
        readerToken,
        readerUser,
        setReaderSession,
        logoutReader,
        readerDrawerOpen,
        setReaderDrawerOpen,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
