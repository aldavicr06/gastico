import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSettings, setSetting } from './db';
import type { Currency } from './format';
import { dark, light, type Palette } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Toast = {
  id: number;
  message: string;
  tone?: 'default' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
};

type AppState = {
  colors: Palette;
  currency: Currency;
  themeMode: ThemeMode;
  setCurrency: (c: Currency) => void;
  setThemeMode: (m: ThemeMode) => void;
  /** Increments whenever data changes, so screens know to reload. */
  dataVersion: number;
  notifyDataChanged: () => void;
  /** Snackbar shown at the bottom of the app (e.g. "Movimiento borrado · Deshacer"). */
  toast: Toast | null;
  showToast: (t: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [currency, setCurrencyState] = useState<Currency>('CRC');
  const [themeMode, setThemeState] = useState<ThemeMode>('system');
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

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
  const showToast = useCallback((t: Omit<Toast, 'id'>) => setToast({ ...t, id: Date.now() }), []);
  const hideToast = useCallback(() => setToast(null), []);

  // Each toast disappears on its own after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && system === 'dark');

  const value = useMemo<AppState>(() => ({
    colors: isDark ? dark : light,
    currency,
    themeMode,
    setCurrency,
    setThemeMode,
    dataVersion,
    notifyDataChanged,
    toast,
    showToast,
    hideToast,
  }), [isDark, currency, themeMode, setCurrency, setThemeMode, dataVersion, notifyDataChanged, toast, showToast, hideToast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
