import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AdminUser, ReaderUser } from '../types/news.ts';

export type LanguageFilter = 'all' | 'en' | 'hi';
export type FontSizeScale = 'sm' | 'md' | 'lg';

interface PortalContextValue {
  language: LanguageFilter;
  setLanguage: (lang: LanguageFilter) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  fontSize: FontSizeScale;
  setFontSize: (size: FontSizeScale) => void;
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
