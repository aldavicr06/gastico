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
  const { dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loader(db).then((d) => alive && setData(d));
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, dataVersion, ...deps]),
  );

  return data;
}
