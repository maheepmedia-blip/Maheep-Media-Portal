import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AdminUser } from '../types/news.ts';

export type LanguageFilter = 'all' | 'en' | 'hi';

interface PortalContextValue {
  language: LanguageFilter;
  setLanguage: (lang: LanguageFilter) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  adminToken: string | null;
  adminUser: AdminUser | null;
  setAdminSession: (token: string | null, user: AdminUser | null) => void;
  logoutAdmin: () => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  // Session token stays strictly in React memory (never persisted in localStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const setAdminSession = (token: string | null, user: AdminUser | null) => {
    setAdminToken(token);
    setAdminUser(user);
  };

  const logoutAdmin = () => {
    setAdminToken(null);
    setAdminUser(null);
  };

  return (
    <PortalContext.Provider
      value={{
        language,
        setLanguage,
        darkMode,
        toggleDarkMode,
        adminToken,
        adminUser,
        setAdminSession,
        logoutAdmin,
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
