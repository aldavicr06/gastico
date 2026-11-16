import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { budgetColor, Button, Card, CategoryIcon, Muted, ProgressBar, Title } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { getMonthSummary, setBudget, type Category } from '../../lib/db';
import { centsToInput, CURRENCY_SYMBOL, currentMonth, formatMoney, formatPercent, inputToCents, monthLabel, sanitizeAmountInput } from '../../lib/format';
import { useData } from '../../lib/use-data';

type Row = Category & { spent_cents: number };

export default function PresupuestosScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged } = useApp();
  const month = currentMonth();
  const summary = useData((d) => getMonthSummary(d, month), [month]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [value, setValue] = useState('');
  const [showWithout, setShowWithout] = useState(false);

  const rows = summary?.byCategory ?? [];
  const withBudget = rows.filter((r) => r.budget_cents);
  const without = rows.filter((r) => !r.budget_cents);
  const totalBudget = summary?.budget_cents ?? 0;
  const totalSpentBudgeted = withBudget.reduce((s, r) => s + r.spent_cents, 0);
  // Categories at 80 % or more of their budget, most used first.
  const atRisk = withBudget
    .map((r) => ({ ...r, ratio: r.spent_cents / (r.budget_cents as number) }))
    .filter((r) => r.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio);

  const openEdit = (r: Row) => {
    setEditing(r);
    setValue(r.budget_cents ? centsToInput(r.budget_cents) : '');
  };

  const save = async () => {
    if (!editing) return;
    const cents = inputToCents(value);
    await setBudget(db, editing.id, cents > 0 ? cents : null);
    setEditing(null);
    notifyDataChanged();
  };

  const renderRow = (r: Row) => {
    const ratio = r.budget_cents ? r.spent_cents / r.budget_cents : 0;
    const left = (r.budget_cents ?? 0) - r.spent_cents;
    return (
      <Pressable key={r.id} onPress={() => openEdit(r)} accessibilityRole="button">
        <Card style={{ marginBottom: 10, gap: 10 }}>
          <View style={styles.rowHead}>
            <CategoryIcon icon={r.icon} color={r.color} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
              {!r.budget_cents && (
                <Muted numberOfLines={1}>{formatMoney(r.spent_cents, currency)} gastado · toca para definir</Muted>
              )}
            </View>
            {r.budget_cents ? (
              <Text style={{ color: budgetColor(ratio, colors), fontWeight: '800', fontSize: 14 }}>{formatPercent(ratio)}</Text>
            ) : null}
          </View>
          {r.budget_cents ? (
            <>
              <ProgressBar value={ratio} color={budgetColor(ratio, colors)} />
              {/* Amounts under the bar; "Quedan" wraps below instead of being cut on narrow screens. */}
              <View style={styles.amountsRow}>
                <Muted>
                  {formatMoney(r.spent_cents, currency)} de {formatMoney(r.budget_cents, currency)}
                </Muted>
                <Text style={{ color: left >= 0 ? colors.textMuted : colors.danger, fontWeight: '700', fontSize: 13 }}>
                  {left >= 0 ? `Quedan ${formatMoney(left, currency)}` : `Excedido ${formatMoney(-left, currency)}`}
                </Text>
              </View>
            </>
          ) : null}
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Title>Presupuestos</Title>
        <Muted style={{ marginTop: 4, marginBottom: 16 }}>{monthLabel(month)}</Muted>

        {totalBudget > 0 && (
          <Card style={{ marginBottom: 16, gap: 10 }}>
            <Muted>Total presupuestado</Muted>
            <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>
              {formatMoney(totalSpentBudgeted, currency)}
              <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '600' }}> / {formatMoney(totalBudget, currency)}</Text>
            </Text>
            <ProgressBar value={totalSpentBudgeted / totalBudget} color={budgetColor(totalSpentBudgeted / totalBudget, colors)} height={10} />
          </Card>
        )}

        {atRisk.length > 0 && (
          <View style={[styles.alert, { backgroundColor: colors.warning + '22', borderColor: colors.warning }]}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {atRisk.length === 1 ? 'Una categoría está' : `${atRisk.length} categorías están`} cerca del límite
              </Text>
              <Muted>
                {atRisk.map((r) => `${r.name} ${formatPercent(r.ratio)}`).join(' · ')}
              </Muted>
            </View>
          </View>
        )}

        {withBudget.map(renderRow)}
        {withBudget.length === 0 && (
          <Muted style={{ marginBottom: 12 }}>
            Toca una categoría para definir cuánto quieres gastar al mes. El presupuesto se repite cada mes.
          </Muted>
        )}

        {/* Nothing budgeted yet: list everything open so there is something to tap. */}
        {without.length > 0 && withBudget.length > 0 && (
          <Pressable
            onPress={() => setShowWithout((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showWithout }}
            style={styles.collapse}
          >
            <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 }}>
              SIN PRESUPUESTO ({without.length})
            </Text>
            <Ionicons name={showWithout ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
        )}
        {(showWithout || withBudget.length === 0) && without.map(renderRow)}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
          {editing && (
            <View style={[styles.sheet, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CategoryIcon icon={editing.icon} color={editing.color} />
                <Text style={[styles.name, { color: colors.text, fontSize: 18 }]}>Presupuesto de {editing.name}</Text>
              </View>
              <View style={[styles.inputWrap, { backgroundColor: colors.cardAlt }]}>
                <Text style={{ color: colors.textMuted, fontSize: 24, fontWeight: '700' }}>{CURRENCY_SYMBOL[currency]}</Text>
                <TextInput
                  value={value}
                  onChangeText={(t) => setValue(sanitizeAmountInput(t))}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  maxLength={13}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[styles.input, { color: colors.text }]}
                />
              </View>
              <Muted>Déjalo vacío para quitar el presupuesto.</Muted>
              <Button label="Guardar" icon="checkmark" onPress={save} />
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  collapse: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  amountsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 8, rowGap: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { padding: 24, gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16 },
  input: { flex: 1, minWidth: 0, width: '100%', fontSize: 28, fontWeight: '800', paddingVertical: 14 },
});
