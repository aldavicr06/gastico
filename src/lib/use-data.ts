import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useApp } from './app-context';

/**
 * Loads data from SQLite whenever the screen gains focus or data changes.
 * `deps` are extra values (e.g. the selected month) that trigger a reload.
 */
export function useData<T>(loader: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const db = useSQLiteContext();
  const { dataVersion, registerLoader, commitPendingCurrency } = useApp();
  const [data, setData] = useState<T | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const unregister = registerLoader();
      loader(db)
        .then((d) => {
          if (!alive) return;
          // Same callback, so React shows the new data and a pending currency in one render.
          setData(d);
          commitPendingCurrency();
        })
        .catch(commitPendingCurrency);
      return () => {
        alive = false;
        unregister();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, dataVersion, ...deps]),
  );

  return data;
}
