import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { useApp } from './app-context';
import {
  deleteTransaction, getCategoryMonth, isUntouchedDemo, restoreTransaction, seedDemoData, type Transaction,
} from './db';
import { formatPercent, type Currency } from './format';
import { categoryName } from './i18n';

/** Deletes right away and offers "Deshacer" in a toast (no confirm dialog). */
export function useDeleteTransaction() {
  const db = useSQLiteContext();
  const { notifyDataChanged, showToast, hideToast, t } = useApp();

  return useCallback(
    async (tx: Transaction) => {
      // Keep only the table's own columns; list rows also carry category_* fields.
      const saved: Transaction = {
        id: tx.id, type: tx.type, amount_cents: tx.amount_cents, category_id: tx.category_id,
        note: tx.note, merchant: tx.merchant, date: tx.date, source: tx.source,
        receipt_uri: tx.receipt_uri, created_at: tx.created_at,
      };
      await deleteTransaction(db, tx.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notifyDataChanged();
      showToast({
        message: t.toast.deleted,
        actionLabel: t.toast.undo,
        onAction: async () => {
          hideToast();
          await restoreTransaction(db, saved);
          notifyDataChanged();
        },
      });
    },
    [db, notifyDataChanged, showToast, hideToast, t],
  );
}

/**
 * Switches between colones and dollars right away, with no dialog or message.
 * Untouched demo data is reloaded in the new currency (amounts converted);
 * the user's own amounts keep their numbers and only change symbol.
 */
export function useChangeCurrency() {
  const db = useSQLiteContext();
  const { currency, setCurrency, notifyDataChanged, lang } = useApp();

  return useCallback(
    async (c: Currency) => {
      if (c === currency) return;
      if (await isUntouchedDemo(db)) {
        // Symbol and converted amounts appear together: "₡579,24" never flashes on screen.
        notifyDataChanged(await seedDemoData(db, lang, c));
        return;
      }
      setCurrency(c);
    },
    [db, currency, setCurrency, notifyDataChanged, lang],
  );
}

const THRESHOLDS = [1, 0.8];

/**
 * Snapshot a category's spending before a save, then call the returned
 * function after it: shows a toast when the save crosses 80 % or 100 %.
 */
export function useBudgetAlert() {
  const db = useSQLiteContext();
  const { showToast, t, lang } = useApp();

  return useCallback(
    async (categoryId: string, month: string) => {
      const before = await getCategoryMonth(db, categoryId, month);
      return async () => {
        const after = await getCategoryMonth(db, categoryId, month);
        if (!before || !after?.budget_cents) return;
        const r0 = before.spent_cents / after.budget_cents;
        const r1 = after.spent_cents / after.budget_cents;
        const crossed = THRESHOLDS.find((t) => r0 < t && r1 >= t);
        if (crossed === undefined) return;
        const name = categoryName(t, categoryId, after.name);
        const pct = formatPercent(r1, lang);
        showToast({
          tone: 'warning',
          message: crossed >= 1 ? t.toast.overBudget(name, pct) : t.toast.nearBudget(name, pct),
        });
      };
    },
    [db, showToast, t, lang],
  );
}
