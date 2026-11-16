import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Chip } from '../components/ui';
import { useApp } from '../lib/app-context';
import { addTransaction, getCategories, type TxType } from '../lib/db';
import { CURRENCY_SYMBOL, inputToCents, toISODate } from '../lib/format';
import { useData } from '../lib/use-data';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function AddScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged } = useApp();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const categories = useData((d) => getCategories(d, type), [type]);

  useEffect(() => setCategoryId(null), [type]);

  const press = (k: string) => {
    Haptics.selectionAsync();
    setAmount((a) => {
      if (k === '⌫') return a.slice(0, -1);
      if (k === '.') return currency === 'CRC' || a.includes('.') ? a : (a || '0') + '.';
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (a.replace('.', '').length >= 10) return a;
      return a === '0' ? k : a + k;
    });
  };

  const cents = inputToCents(amount);
  const display = amount
    ? String(Number(amount.split('.')[0])).replace(/\B(?=(\d{3})+(?!\d))/g, currency === 'CRC' ? ' ' : ',') +
      (amount.includes('.') ? '.' + amount.split('.')[1] : '')
    : '0';

  const save = async () => {
    if (!cents || !categoryId) return;
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    await addTransaction(db, {
      type,
      amount_cents: cents,
      category_id: categoryId,
      note: note.trim() || null,
      merchant: null,
      date: toISODate(d),
      source: 'manual',
      receipt_uri: null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notifyDataChanged();
    router.back();
  };

  const accent = type === 'expense' ? colors.expense : colors.income;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <View style={[styles.segment, { backgroundColor: colors.cardAlt }]}>
          {(['expense', 'income'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.segmentItem, type === t && { backgroundColor: colors.card }]}
            >
              <Text style={{ color: type === t ? colors.text : colors.textMuted, fontWeight: '700' }}>
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => router.replace('/scan')} hitSlop={12}>
          <Ionicons name="scan" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <View style={styles.amountBox}>
          <Text style={[styles.amount, { color: amount ? accent : colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
            {CURRENCY_SYMBOL[currency]}{display}
          </Text>
        </View>

        <CategoryPicker categories={categories ?? []} selected={categoryId} onSelect={setCategoryId} />

        <View style={styles.row}>
          <Chip label="Hoy" active={dayOffset === 0} onPress={() => setDayOffset(0)} icon="calendar-outline" />
          <Chip label="Ayer" active={dayOffset === 1} onPress={() => setDayOffset(1)} />
          <Chip label="Anteayer" active={dayOffset === 2} onPress={() => setDayOffset(2)} />
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Nota (opcional)"
          placeholderTextColor={colors.textMuted}
          style={[styles.note, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
        />
      </ScrollView>

      <View style={[styles.keypad, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            onLongPress={() => k === '⌫' && setAmount('')}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.cardAlt }]}
          >
            {k === '⌫' ? (
              <Ionicons name="backspace-outline" size={24} color={colors.text} />
            ) : (
              <Text style={[styles.keyText, { color: k === '.' && currency === 'CRC' ? colors.border : colors.text }]}>{k}</Text>
            )}
          </Pressable>
        ))}
        <Button
          label={!categoryId ? 'Elige una categoría' : 'Guardar'}
          icon="checkmark"
          onPress={save}
          disabled={!cents || !categoryId}
          style={{ width: '100%', marginTop: 8 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4 },
  segmentItem: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 10 },
  amountBox: { alignItems: 'center', paddingVertical: 24 },
  amount: { fontSize: 52, fontWeight: '900', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8, marginTop: 16 },
  note: { marginTop: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: StyleSheet.hairlineWidth },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  key: { width: '33.33%', height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  keyText: { fontSize: 26, fontWeight: '600' },
});
