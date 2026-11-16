import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSettings, setSetting } from './db';
import type { Currency } from './format';
import { dark, light, type Palette } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

type AppState = {
  colors: Palette;
  currency: Currency;
  themeMode: ThemeMode;
  setCurrency: (c: Currency) => void;
  setThemeMode: (m: ThemeMode) => void;
  /** Increments whenever data changes, so screens know to reload. */
  dataVersion: number;
  notifyDataChanged: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [currency, setCurrencyState] = useState<Currency>('CRC');
  const [themeMode, setThemeState] = useState<ThemeMode>('system');
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    getSettings(db).then((s) => {
      if (s.currency === 'CRC' || s.currency === 'USD') setCurrencyState(s.currency);
      if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') setThemeState(s.theme);
    });
  }, [db]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    setSetting(db, 'currency', c);
  }, [db]);

  const setThemeMode = useCallback((m: ThemeMode) => {
    setThemeState(m);
    setSetting(db, 'theme', m);
  }, [db]);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && system === 'dark');

  const value = useMemo<AppState>(() => ({
    colors: isDark ? dark : light,
    currency,
    themeMode,
    setCurrency,
    setThemeMode,
    dataVersion,
    notifyDataChanged,
  }), [isDark, currency, themeMode, setCurrency, setThemeMode, dataVersion, notifyDataChanged]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
