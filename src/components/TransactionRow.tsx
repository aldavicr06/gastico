import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import type { TransactionWithCategory } from '../lib/db';
import { formatMoney, shortDate } from '../lib/format';
import { CategoryIcon } from './ui';

export function TransactionRow({
  tx,
  showDate,
  onLongPress,
}: {
  tx: TransactionWithCategory;
  showDate?: boolean;
  onLongPress?: () => void;
}) {
  const { colors, currency } = useApp();
  const isIncome = tx.type === 'income';
  const title = tx.merchant || tx.note || tx.category_name;
  const subtitle = [tx.category_name, showDate ? shortDate(tx.date) : null].filter(Boolean).join(' · ');

  return (
    <Pressable onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <CategoryIcon icon={tx.category_icon} color={tx.category_color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {tx.source === 'scan' && <Ionicons name="scan" size={12} color={colors.primary} />}
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{subtitle}</Text>
        </View>
      </View>
      <Text style={[styles.amount, { color: isIncome ? colors.income : colors.text }]}>
        {isIncome ? '+' : '−'}{formatMoney(tx.amount_cents, currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  title: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
