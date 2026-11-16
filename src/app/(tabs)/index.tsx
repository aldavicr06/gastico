import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Donut } from '../../components/Donut';
import { TransactionRow } from '../../components/TransactionRow';
import { budgetColor, Card, Muted, ProgressBar, SectionTitle } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { getMonthSummary, getTransactionsForMonth } from '../../lib/db';
import { currentMonth, formatCompact, formatMoney, monthLabel } from '../../lib/format';
import { useData } from '../../lib/use-data';

export default function HomeScreen() {
  const { colors, currency } = useApp();
  const month = currentMonth();
  const data = useData(async (db) => ({
    summary: await getMonthSummary(db, month),
    recent: await getTransactionsForMonth(db, month, 5),
  }), [month]);

  const summary = data?.summary;
  const spent = summary?.expense_cents ?? 0;
  const income = summary?.income_cents ?? 0;
  const budget = summary?.budget_cents ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const slices = (summary?.byCategory ?? []).filter((c) => c.spent_cents > 0);
  const top = slices.slice(0, 5);
  const isEmpty = data !== null && data.recent.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Muted>{monthLabel(month)}</Muted>
            <Text style={[styles.hello, { color: colors.text }]}>Hola 👋</Text>
          </View>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.onPrimary, fontWeight: '900', fontSize: 18 }}>₡</Text>
          </View>
        </View>

        {/* Hero: spent this month */}
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Text style={[styles.heroLabel, { color: colors.onPrimary }]}>Gastado este mes</Text>
          <Text style={[styles.heroAmount, { color: colors.onPrimary }]}>{formatMoney(spent, currency)}</Text>
          {budget > 0 ? (
            <>
              <View style={styles.heroBarTrack}>
                <View
                  style={[
                    styles.heroBarFill,
                    { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: ratio >= 1 ? '#FFB4B4' : colors.onPrimary },
                  ]}
                />
              </View>
              <Text style={[styles.heroSub, { color: colors.onPrimary }]}>
                {Math.round(ratio * 100)}% de {formatMoney(budget, currency)} presupuestado
              </Text>
            </>
          ) : (
            <Text style={[styles.heroSub, { color: colors.onPrimary }]}>Define presupuestos para ver tu avance</Text>
          )}
        </View>

        {/* Income / balance */}
        <View style={styles.row2}>
          <Card style={{ flex: 1 }}>
            <View style={styles.statHead}>
              <Ionicons name="arrow-down-circle" size={18} color={colors.income} />
              <Muted>Ingresos</Muted>
            </View>
            <Text style={[styles.stat, { color: colors.text }]}>{formatMoney(income, currency)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <View style={styles.statHead}>
              <Ionicons name="wallet" size={18} color={colors.primary} />
              <Muted>Balance</Muted>
            </View>
            <Text style={[styles.stat, { color: income - spent >= 0 ? colors.text : colors.expense }]}>
              {formatMoney(income - spent, currency)}
            </Text>
          </Card>
        </View>

        {/* Quick actions */}
        <View style={styles.row2}>
          <Pressable
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="scan" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Escanear</Text>
              <Muted style={{ fontSize: 12 }}>factura o voucher</Muted>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/add')}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="add" size={24} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Agregar</Text>
              <Muted style={{ fontSize: 12 }}>gasto o ingreso</Muted>
            </View>
          </Pressable>
        </View>

        {/* Donut by category */}
        {slices.length > 0 && (
          <>
            <SectionTitle>¿En qué se fue la plata?</SectionTitle>
            <Card style={styles.donutCard}>
              <Donut data={slices.map((c) => ({ value: c.spent_cents, color: c.color }))} size={150} stroke={18} track={colors.cardAlt}>
                <Muted style={{ fontSize: 11 }}>Total</Muted>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{formatCompact(spent, currency)}</Text>
              </Donut>
              <View style={{ flex: 1, gap: 10 }}>
                {top.map((c) => (
                  <View key={c.id} style={{ gap: 4 }}>
                    <View style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{c.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{Math.round((c.spent_cents / spent) * 100)}%</Text>
                    </View>
                    {c.budget_cents ? (
                      <ProgressBar value={c.spent_cents / c.budget_cents} color={budgetColor(c.spent_cents / c.budget_cents, colors)} height={4} />
                    ) : null}
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}

        {/* Recent */}
        <SectionTitle
          right={
            <Pressable onPress={() => router.push('/movimientos')}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Ver todo</Text>
            </Pressable>
          }
        >
          Últimos movimientos
        </SectionTitle>
        <Card style={{ paddingVertical: 6 }}>
          {isEmpty ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>Todavía no hay movimientos</Text>
              <Muted style={{ textAlign: 'center' }}>Escanea tu primera factura o carga los datos demo en Ajustes.</Muted>
            </View>
          ) : (
            data?.recent.map((tx) => <TransactionRow key={tx.id} tx={tx} showDate />)
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  hello: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  logo: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 28, padding: 22, gap: 6 },
  heroLabel: { fontSize: 14, fontWeight: '600', opacity: 0.85 },
  heroAmount: { fontSize: 40, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroBarTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 8 },
  heroBarFill: { height: 8, borderRadius: 8 },
  heroSub: { fontSize: 13, opacity: 0.9, marginTop: 4 },
  row2: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat: { fontSize: 18, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20, borderWidth: 1.5 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontWeight: '700' },
  donutCard: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
});
