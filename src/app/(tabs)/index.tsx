import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Donut } from '../../components/Donut';
import { TransactionRow } from '../../components/TransactionRow';
import { budgetColor, Card, LanguageToggle, Muted, ProgressBar, SectionTitle } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { getExpenseTotal, getMonthSummary, getTransactionsForMonth } from '../../lib/db';
import { CURRENCY_SYMBOL, currentMonth, daysInMonth, formatCompact, formatMoney, formatPercent, monthLabel, shiftMonth } from '../../lib/format';
import { categoryName, type Lang, type Strings } from '../../lib/i18n';
import { useData } from '../../lib/use-data';

/** Same stretch of last month: 1st up to today's day (clamped to its length). */
function previousPeriod(month: string, day: number) {
  const prev = shiftMonth(month, -1);
  const end = String(Math.min(day, daysInMonth(prev))).padStart(2, '0');
  return { prev, from: `${prev}-01`, to: `${prev}-${end}` };
}

/** "Promedio diario ₡X · 12 % menos que octubre a esta fecha" / "Daily average $X · 12% less than October to date". */
function spendingInsight(
  spent: number, prevSpent: number, day: number, prevMonth: string,
  fmt: (c: number) => string, t: Strings, lang: Lang,
) {
  if (spent === 0) return t.home.noSpendingYet;
  // Whole colones/dollars: an average with céntimos reads as noise.
  const parts = [t.home.dailyAverage(fmt(Math.round(spent / day / 100) * 100))];
  if (prevSpent > 0) {
    const diff = Math.round(((spent - prevSpent) / prevSpent) * 100);
    const prevName = monthLabel(prevMonth, false, lang);
    parts.push(
      diff === 0 ? t.home.sameAsLastMonth(prevName)
      : t.home.vsLastMonth(formatPercent(Math.abs(diff) / 100, lang), diff > 0, prevName),
    );
  }
  return parts.join(' · ');
}

/**
 * Biggest font (max 40) that fits `label` on one line in `width` px. Web has no
 * adjustsFontSizeToFit, so measure: heavy digits are ~0.62 em wide.
 */
function fitFontSize(label: string, width: number) {
  if (!width) return 40;
  return Math.max(16, Math.min(40, Math.floor(width / (label.length * 0.62))));
}

export default function HomeScreen() {
  const { colors, currency, t, lang } = useApp();
  const month = currentMonth();
  const day = new Date().getDate();
  const period = previousPeriod(month, day);
  const data = useData(async (db) => ({
    summary: await getMonthSummary(db, month),
    recent: await getTransactionsForMonth(db, month, 5),
    prevSpent: await getExpenseTotal(db, period.from, period.to),
  }), [month, day]);

  const summary = data?.summary;
  const spent = summary?.expense_cents ?? 0;
  const income = summary?.income_cents ?? 0;
  const budget = summary?.budget_cents ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const slices = (summary?.byCategory ?? []).filter((c) => c.spent_cents > 0);
  const top = slices.slice(0, 5);
  const spentLabel = formatMoney(spent, currency);
  const [heroWidth, setHeroWidth] = useState(0);
  const isEmpty = data !== null && data.recent.length === 0;
  const insight = data
    ? spendingInsight(spent, data.prevSpent, day, period.prev, (c) => formatMoney(c, currency), t, lang)
    : '';
  const edit = (id: number) => router.push({ pathname: '/add', params: { id: String(id) } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexShrink: 1 }}>
            <Muted>{monthLabel(month, true, lang)}</Muted>
            <Text style={[styles.hello, { color: colors.text }]}>{t.home.hello}</Text>
          </View>
          <View style={styles.headerRight}>
            <LanguageToggle />
            <View style={[styles.logo, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.onPrimary, fontWeight: '900', fontSize: 18 }}>{CURRENCY_SYMBOL[currency]}</Text>
            </View>
          </View>
        </View>

        {/* Hero: spent this month */}
        <View style={[styles.hero, { backgroundColor: colors.hero }]}>
          <Text style={[styles.heroLabel, { color: colors.onHero }]}>{t.home.spentThisMonth}</Text>
          <Text
            onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
            style={[styles.heroAmount, { color: colors.onHero, fontSize: fitFontSize(spentLabel, heroWidth) }]}
            numberOfLines={1}
          >
            {spentLabel}
          </Text>
          {budget > 0 && (
            <>
              <View style={styles.heroBarTrack}>
                <View
                  style={[
                    styles.heroBarFill,
                    { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: ratio >= 1 ? '#FFB4B4' : colors.onHero },
                  ]}
                />
              </View>
              <Text style={[styles.heroSub, { color: colors.onHero }]}>
                {t.home.budgetOf(formatPercent(ratio, lang), formatMoney(budget, currency))}
              </Text>
            </>
          )}
          {insight ? <Text style={[styles.heroSub, { color: colors.onHero }]}>{insight}</Text> : null}
        </View>

        {/* Income / balance */}
        <View style={styles.row2}>
          <Card style={styles.statCard}>
            <View style={styles.statHead}>
              <Ionicons name="arrow-down-circle" size={18} color={colors.income} />
              <Muted>{t.home.income}</Muted>
            </View>
            <Text style={[styles.stat, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(income, currency)}</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statHead}>
              <Ionicons name="wallet" size={18} color={colors.primary} />
              <Muted>{t.home.balance}</Muted>
            </View>
            <Text style={[styles.stat, { color: income - spent >= 0 ? colors.text : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(income - spent, currency)}
            </Text>
          </Card>
        </View>

        {/* Quick actions: stack instead of breaking words on very narrow screens */}
        <View style={styles.row2}>
          <Pressable
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="scan" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]} numberOfLines={1}>{t.home.scan}</Text>
              <Muted style={{ fontSize: 12 }} numberOfLines={2}>{t.home.scanSub}</Muted>
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
              <Text style={[styles.actionTitle, { color: colors.text }]} numberOfLines={1}>{t.home.add}</Text>
              <Muted style={{ fontSize: 12 }} numberOfLines={2}>{t.home.addSub}</Muted>
            </View>
          </Pressable>
        </View>

        {/* Donut by category */}
        {slices.length > 0 && (
          <>
            <SectionTitle>{t.home.whereMoneyWent}</SectionTitle>
            <Card style={styles.donutCard}>
              <Donut data={slices.map((c) => ({ value: c.spent_cents, color: c.color }))} size={150} stroke={18} track={colors.cardAlt}>
                <Muted style={{ fontSize: 11 }}>{t.common.total}</Muted>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{formatCompact(spent, currency)}</Text>
              </Donut>
              {/* Legend keeps a readable width; on very narrow phones it moves below the chart. */}
              <View style={{ flexGrow: 1, flexBasis: 130, gap: 10 }}>
                {top.map((c) => (
                  <View key={c.id} style={{ gap: 4 }}>
                    <View style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{categoryName(t, c.id, c.name)}</Text>
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
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t.home.seeAll}</Text>
            </Pressable>
          }
        >
          {t.home.recent}
        </SectionTitle>
        <Card style={{ paddingVertical: 6 }}>
          {isEmpty ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>{t.home.emptyTitle}</Text>
              <Muted style={{ textAlign: 'center' }}>{t.home.emptyBody}</Muted>
            </View>
          ) : (
            data?.recent.map((tx) => <TransactionRow key={tx.id} tx={tx} showDate onPress={() => edit(tx.id)} />)
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hello: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  logo: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 28, padding: 22, gap: 6 },
  heroLabel: { fontSize: 14, fontWeight: '600' },
  heroAmount: { fontSize: 40, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroBarTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 8 },
  heroBarFill: { height: 8, borderRadius: 8 },
  heroSub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  statCard: { flexGrow: 1, flexBasis: 140 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat: { fontSize: 18, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] },
  action: { flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20, borderWidth: 1.5 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontWeight: '700' },
  donutCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
});
