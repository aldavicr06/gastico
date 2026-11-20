import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useApp } from './app-context';
import type { Strings } from './i18n';

const titleFor = (t: Strings, path: string): string | undefined =>
  ({
    '/': t.tabs.home,
    '/movimientos': t.tabs.transactions,
    '/presupuestos': t.tabs.budgets,
    '/ajustes': t.tabs.settings,
    '/add': t.titles.add,
    '/scan': t.titles.scan,
  })[path];

/** Web only: keeps the browser tab title as "<Pantalla> · Gastico" while navigating. */
export function useDocumentTitle() {
  const pathname = usePathname();
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const { t, lang } = useApp();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const screen = pathname === '/add' && id ? t.titles.edit : titleFor(t, pathname);
    document.title = screen ? `${screen} · Gastico` : 'Gastico';
    document.documentElement.lang = lang;
  }, [pathname, id, t, lang]);
}
