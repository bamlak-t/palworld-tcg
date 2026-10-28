import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { PREFS_APPLIED, prefsChanged } from '@/lib/prefs';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pal-theme';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    // Storage can be unavailable (private mode); fall back to system.
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  // Preferences synced from your account.
  useEffect(() => {
    const reload = () => setThemeState(readStoredTheme());
    window.addEventListener(PREFS_APPLIED, reload);
    return () => window.removeEventListener(PREFS_APPLIED, reload);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Non-fatal: the choice just won't persist.
    }
    prefsChanged();
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
