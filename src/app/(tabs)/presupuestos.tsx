import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { budgetColor, Button, Card, CategoryIcon, Muted, ProgressBar, Title } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { getMonthSummary, setBudget, type Category } from '../../lib/db';
import { CURRENCY_SYMBOL, currentMonth, formatMoney, inputToCents, monthLabel } from '../../lib/format';
import { useData } from '../../lib/use-data';

type Row = Category & { spent_cents: number };

export default function PresupuestosScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged } = useApp();
  const month = currentMonth();
  const summary = useData((d) => getMonthSummary(d, month), [month]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [value, setValue] = useState('');

  const rows = summary?.byCategory ?? [];
  const withBudget = rows.filter((r) => r.budget_cents);
  const without = rows.filter((r) => !r.budget_cents);
  const totalBudget = summary?.budget_cents ?? 0;
  const totalSpentBudgeted = withBudget.reduce((s, r) => s + r.spent_cents, 0);

  const openEdit = (r: Row) => {
    setEditing(r);
    setValue(r.budget_cents ? String(r.budget_cents / 100) : '');
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
      <Pressable key={r.id} onPress={() => openEdit(r)}>
        <Card style={{ marginBottom: 10, gap: 10 }}>
          <View style={styles.rowHead}>
            <CategoryIcon icon={r.icon} color={r.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{r.name}</Text>
              {r.budget_cents ? (
                <Muted>
                  {formatMoney(r.spent_cents, currency)} de {formatMoney(r.budget_cents, currency)}
                </Muted>
              ) : (
                <Muted>{formatMoney(r.spent_cents, currency)} gastado · toca para definir</Muted>
              )}
            </View>
            {r.budget_cents ? (
              <Text style={{ color: left >= 0 ? colors.textMuted : colors.danger, fontWeight: '700', fontSize: 13 }}>
                {left >= 0 ? `Quedan ${formatMoney(left, currency)}` : `+${formatMoney(-left, currency)}`}
              </Text>
            ) : null}
          </View>
          {r.budget_cents ? <ProgressBar value={ratio} color={budgetColor(ratio, colors)} /> : null}
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

        {withBudget.map(renderRow)}
        {without.length > 0 && <Muted style={{ marginVertical: 10, fontWeight: '700' }}>SIN PRESUPUESTO</Muted>}
        {without.map(renderRow)}
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
                  onChangeText={setValue}
                  keyboardType="decimal-pad"
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
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { padding: 24, gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 28, fontWeight: '800', paddingVertical: 14 },
});
