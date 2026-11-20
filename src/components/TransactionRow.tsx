import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useApp } from '../lib/app-context';
import type { TransactionWithCategory } from '../lib/db';
import { formatMoney, localTime, shortDate } from '../lib/format';
import { categoryName, type Lang } from '../lib/i18n';
import { CategoryIcon } from './ui';

/**
 * Second line under the title. Never repeats the title: when there is no
 * merchant or note the title already is the category, so show when instead.
 */
function subtitleFor(tx: TransactionWithCategory, title: string, category: string, lang: Lang, showDate?: boolean) {
  const parts: string[] = [];
  if (title !== category) parts.push(category);
  // The note is the title only when there is no merchant; otherwise show it here.
  if (tx.note && title !== tx.note) parts.push(tx.note);
  if (showDate) {
    parts.push(shortDate(tx.date, lang));
  } else if (parts.length === 0) {
    // Creation time only makes sense if it was logged the same day it happened.
    const created = localTime(tx.created_at);
    parts.push(created && created.date === tx.date ? created.time : shortDate(tx.date, lang));
  }
  return parts.join(' · ');
}

export function TransactionRow({
  tx,
  showDate,
  onPress,
  onLongPress,
}: {
  tx: TransactionWithCategory;
  showDate?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { colors, currency, t, lang } = useApp();
  // On narrow screens the chevron gives its room to the name and the amount.
  const { width } = useWindowDimensions();
  const showChevron = !!onPress && width >= 360;
  const isIncome = tx.type === 'income';
  const category = categoryName(t, tx.category_id, tx.category_name);
  const title = tx.merchant || tx.note || category;
  const subtitle = subtitleFor(tx, title, category, lang, showDate);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? t.transactions.rowHint : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <CategoryIcon icon={tx.category_icon} color={tx.category_color} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {tx.source === 'scan' && <Ionicons name="scan" size={12} color={colors.primary} />}
          <Text style={{ color: colors.textMuted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
      <Text style={[styles.amount, { color: isIncome ? colors.income : colors.text }]} numberOfLines={1}>
        {isIncome ? '+' : '−'}{formatMoney(tx.amount_cents, currency)}
      </Text>
      {showChevron && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  // The amount is never cut; the name truncates with "…" but keeps a readable minimum.
  texts: { flex: 1, minWidth: 64 },
  title: { fontSize: 15, fontWeight: '600' },
  amount: { flexShrink: 0, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
