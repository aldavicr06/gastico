import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TransactionRow } from '../../components/TransactionRow';
import { Chip, Muted, Title } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { deleteTransaction, getTransactionsForMonth, type TransactionWithCategory } from '../../lib/db';
import { currentMonth, dayLabel, formatMoney, monthLabel, shiftMonth } from '../../lib/format';
import { useData } from '../../lib/use-data';

type Filter = 'all' | 'expense' | 'income';

export default function MovimientosScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<Filter>('all');
  const txs = useData((d) => getTransactionsForMonth(d, month), [month]);

  const sections = useMemo(() => {
    const list = (txs ?? []).filter((t) => filter === 'all' || t.type === filter);
    const groups = new Map<string, TransactionWithCategory[]>();
    for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
    return [...groups.entries()].map(([date, data]) => ({
      date,
      total: data.reduce((s, t) => s + (t.type === 'expense' ? -t.amount_cents : t.amount_cents), 0),
      data,
    }));
  }, [txs, filter]);

  const confirmDelete = (tx: TransactionWithCategory) =>
    Alert.alert('¿Borrar movimiento?', `${tx.merchant || tx.category_name} · ${formatMoney(tx.amount_cents, currency)}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, tx.id);
          notifyDataChanged();
        },
      },
    ]);

  const isCurrent = month === currentMonth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.top}>
        <Title>Movimientos</Title>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12} style={[styles.arrow, { backgroundColor: colors.card }]}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={[styles.month, { color: colors.text }]}>{monthLabel(month)}</Text>
          <Pressable
            onPress={() => !isCurrent && setMonth(shiftMonth(month, 1))}
            hitSlop={12}
            style={[styles.arrow, { backgroundColor: colors.card, opacity: isCurrent ? 0.3 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.chips}>
          <Chip label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Gastos" active={filter === 'expense'} onPress={() => setFilter('expense')} />
          <Chip label="Ingresos" active={filter === 'income'} onPress={() => setFilter('income')} />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>
              {dayLabel(section.date)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              {formatMoney(section.total, currency, { sign: true })}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.card, paddingHorizontal: 12, borderRadius: 16, marginBottom: 6 }}>
            <TransactionRow tx={item} onLongPress={() => confirmDelete(item)} />
          </View>
        )}
        ListEmptyComponent={
          txs ? (
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Ionicons name="file-tray-outline" size={40} color={colors.textMuted} />
              <Muted>No hay movimientos en {monthLabel(month, false).toLowerCase()}</Muted>
            </View>
          ) : undefined
        }
        ListFooterComponent={sections.length ? <Muted style={{ textAlign: 'center', marginTop: 12 }}>Mantén presionado para borrar</Muted> : undefined}
      />

      <Pressable
        onPress={() => router.push('/add')}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
