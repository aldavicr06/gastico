import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { countTransactions, getSettings, isUntouchedDemo, seedDemoData, setSetting } from './db';
import type { Currency } from './format';
import { currencyFor, deviceLang, STRINGS, type Lang, type Strings } from './i18n';
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
  lang: Lang;
  /** Every visible text in the current language. */
  t: Strings;
  setCurrency: (c: Currency) => void;
  setThemeMode: (m: ThemeMode) => void;
  setLang: (l: Lang) => Promise<void>;
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
  const [lang, setLangState] = useState<Lang>(deviceLang);
  const [currency, setCurrencyState] = useState<Currency>(() => currencyFor(deviceLang()));
  const [themeMode, setThemeState] = useState<ThemeMode>('system');
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    getSettings(db).then((s) => {
      const savedLang = s.lang === 'es' || s.lang === 'en' ? s.lang : deviceLang();
      setLangState(savedLang);
      if (s.currency === 'CRC' || s.currency === 'USD') setCurrencyState(s.currency);
      else setCurrencyState(currencyFor(savedLang));
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

  /**
   * Switches every label. When there is no data of the user's own (nothing saved,
   * or the untouched demo) the currency follows too: English → $, Spanish → ₡,
   * and the demo reloads with stores and amounts of that country.
   */
  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await setSetting(db, 'lang', l);
    if (await isUntouchedDemo(db)) {
      setCurrency(await seedDemoData(db, l));
      notifyDataChanged();
    } else if ((await countTransactions(db)) === 0) {
      setCurrency(currencyFor(l));
    }
  }, [db, setCurrency, notifyDataChanged]);

  const showToast = useCallback((t: Omit<Toast, 'id'>) => setToast({ ...t, id: Date.now() }), []);
  const hideToast = useCallback(() => setToast(null), []);

  // Each toast disappears on its own after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // A toast in the old language would look broken after switching.
  useEffect(() => setToast(null), [lang]);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && system === 'dark');

  const value = useMemo<AppState>(() => ({
    colors: isDark ? dark : light,
    currency,
    themeMode,
    lang,
    t: STRINGS[lang],
    setCurrency,
    setThemeMode,
    setLang,
    dataVersion,
    notifyDataChanged,
    toast,
    showToast,
    hideToast,
  }), [isDark, currency, themeMode, lang, setCurrency, setThemeMode, setLang, dataVersion, notifyDataChanged, toast, showToast, hideToast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
