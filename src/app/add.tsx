import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Chip } from '../components/ui';
import { useApp } from '../lib/app-context';
import { addTransaction, getCategories, getTransaction, updateTransaction, type Transaction, type TxType } from '../lib/db';
import { addDays, centsToInput, CURRENCY_SYMBOL, dayLabel, inputToCents, toISODate } from '../lib/format';
import { closeModal } from '../lib/navigation';
import { useBudgetAlert, useDeleteTransaction } from '../lib/tx-actions';
import { useData } from '../lib/use-data';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** New transaction, or edit an existing one with `/add?id=12`. */
export default function AddScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged, t, lang } = useApp();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const deleteTx = useDeleteTransaction();
  const budgetAlert = useBudgetAlert();

  const today = toISODate(new Date());
  const [original, setOriginal] = useState<Transaction | null>(null);
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [typing, setTyping] = useState(false);
  const categories = useData((d) => getCategories(d, type), [type]);

  // Edit mode: load the transaction once and prefill every field.
  useEffect(() => {
    if (editId === null) return;
    getTransaction(db, editId).then((tx) => {
      if (!tx) return closeModal();
      setOriginal(tx);
      setType(tx.type);
      setAmount(centsToInput(tx.amount_cents));
      setCategoryId(tx.category_id);
      setMerchant(tx.merchant ?? '');
      setNote(tx.note ?? '');
      setDate(tx.date);
    });
  }, [db, editId]);

  const changeType = (t: TxType) => {
    if (t === type) return;
    setType(t);
    setCategoryId(null); // categories differ between expenses and income
  };

  const press = (k: string) => {
    Haptics.selectionAsync();
    setAmount((a) => {
      if (k === '⌫') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (a.replace('.', '').length >= 10) return a;
      return a === '0' ? k : a + k;
    });
  };

  const cents = inputToCents(amount);
  const display = amount
    ? String(Number(amount.split('.')[0])).replace(/\B(?=(\d{3})+(?!\d))/g, currency === 'CRC' ? ' ' : ',') +
      // Colones use a decimal comma (₡5,55), dollars a point ($5.55).
      (amount.includes('.') ? (currency === 'CRC' ? ',' : '.') + amount.split('.')[1] : '')
    : '0';

  const save = async () => {
    if (!cents || !categoryId) return;
    const fields = {
      type,
      amount_cents: cents,
      category_id: categoryId,
      note: note.trim() || null,
      merchant: merchant.trim() || null,
      date,
    };
    const afterSave = type === 'expense' ? await budgetAlert(categoryId, date.slice(0, 7)) : null;
    if (original) {
      await updateTransaction(db, original.id, fields);
    } else {
      await addTransaction(db, { ...fields, source: 'manual', receipt_uri: null });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notifyDataChanged();
    await afterSave?.();
    closeModal();
  };

  const remove = async () => {
    if (!original) return;
    await deleteTx(original);
    closeModal();
  };

  const accent = type === 'expense' ? colors.expense : colors.income;
  const compact = height < 720;
  const keyHeight = compact ? 44 : 52;
  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];
  // On phones the system keyboard needs the room, so the number pad steps aside while
  // typing. On web there is no on-screen keyboard; keep the pad to avoid a layout jump.
  const hidesPad = Platform.OS !== 'web';
  const inputFocus = hidesPad ? { onFocus: () => setTyping(true), onBlur: () => setTyping(false) } : {};
  const saveLabel = !cents ? t.add.enterAmount : !categoryId ? t.add.pickCategory : original ? t.add.saveChanges : t.common.save;
  const isYesterday = date === addDays(today, -1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => closeModal()} hitSlop={12} accessibilityLabel={t.common.close}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <View style={[styles.segment, { backgroundColor: colors.cardAlt }]}>
          {(['expense', 'income'] as const).map((kind) => (
            <Pressable
              key={kind}
              onPress={() => changeType(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: type === kind }}
              style={[styles.segmentItem, type === kind && { backgroundColor: colors.card }]}
            >
              <Text style={{ color: type === kind ? colors.text : colors.textMuted, fontWeight: '700' }}>
                {kind === 'expense' ? t.add.expense : t.add.income}
              </Text>
            </Pressable>
          ))}
        </View>
        {original ? (
          <Pressable onPress={remove} hitSlop={12} accessibilityLabel={t.add.delete}>
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.replace('/scan')} hitSlop={12} accessibilityLabel={t.add.scan}>
            <Ionicons name="scan" size={24} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* Scrolls on its own above the keypad, so categories are never hidden behind it. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.amountBox, compact && { paddingVertical: 14 }]}>
          <Text
            style={[styles.amount, compact && { fontSize: 44 }, { color: amount ? accent : colors.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {CURRENCY_SYMBOL[currency]}{display}
          </Text>
        </View>

        <CategoryPicker categories={categories ?? []} selected={categoryId} onSelect={setCategoryId} />

        {/* Date: quick chips plus a day-by-day stepper for older dates. */}
        <View style={styles.dateRow}>
          <Chip label={t.add.today} icon="calendar-outline" active={date === today} onPress={() => setDate(today)} />
          <Chip label={t.add.yesterday} active={isYesterday} onPress={() => setDate(addDays(today, -1))} />
          <View style={[styles.stepper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={8} accessibilityLabel={t.add.prevDay}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
            <Text style={[styles.stepperText, { color: colors.text }]} numberOfLines={1}>
              {dayLabel(date, lang)}
            </Text>
            <Pressable
              onPress={() => date < today && setDate(addDays(date, 1))}
              hitSlop={8}
              disabled={date >= today}
              accessibilityLabel={t.add.nextDay}
            >
              <Ionicons name="chevron-forward" size={18} color={date >= today ? colors.border : colors.text} />
            </Pressable>
          </View>
        </View>

        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          maxLength={60}
          placeholder={type === 'expense' ? t.add.merchant : t.add.from}
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
          {...inputFocus}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={140}
          placeholder={t.add.note}
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
          {...inputFocus}
        />
      </ScrollView>

      <View style={[styles.keypad, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {/* Hide the number pad while typing a note so the system keyboard has room. */}
        {!typing &&
          KEYS.map((k) => (
            <Pressable
              key={k}
              onPress={() => press(k)}
              onLongPress={() => k === '⌫' && setAmount('')}
              accessibilityLabel={k === '⌫' ? t.add.deleteDigit : k === '.' ? t.add.decimal : k}
              style={({ pressed }) => [styles.key, { height: keyHeight }, pressed && { backgroundColor: colors.cardAlt }]}
            >
              {k === '⌫' ? (
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              ) : k === '.' ? (
                <View style={[styles.dot, { backgroundColor: colors.text }]} />
              ) : (
                <Text style={[styles.keyText, { color: colors.text }]}>{k}</Text>
              )}
            </Pressable>
          ))}
        <Button
          label={saveLabel}
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
  dateRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  stepperText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize', minWidth: 90, textAlign: 'center' },
  input: { marginTop: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: StyleSheet.hairlineWidth },
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
  key: { width: '33.33%', alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  keyText: { fontSize: 26, fontWeight: '600' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
