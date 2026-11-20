import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Card, CategoryIcon, Muted, type IconName } from '../components/ui';
import { useApp } from '../lib/app-context';
import { applyImport, getCategories, getTransactionIdentities, undoImport, type Category, type TxType } from '../lib/db';
import { notify } from '../lib/dialog';
import { downloadTemplate, readPickedSpreadsheet } from '../lib/files';
import { CURRENCY_SYMBOL, formatMoney, shortDate } from '../lib/format';
import { categoryName, STRINGS } from '../lib/i18n';
import {
  budgetTotals, markDuplicates, parseSheets, transactionKey,
  type CategoryRef, type ImportPlan,
} from '../lib/import';
import { closeModal } from '../lib/navigation';
import { useData } from '../lib/use-data';

type Step = 'pick' | 'reading' | 'review';
type Editing = { kind: 'budget' | 'tx'; key: string; type: TxType } | null;

/** Rows shown in the review; the rest are still imported. */
const MAX_ROWS = 200;

export default function ImportScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged, showToast, hideToast, t, lang } = useApp();
  const categories = useData((d) => getCategories(d));
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const nameOf = (id: string) => {
    const c = byId.get(id);
    return c ? categoryName(t, c.id, c.name) : id;
  };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFileName(asset.name);
    setStep('reading');
    try {
      const sheets = await readPickedSpreadsheet(asset);
      const cats = categories ?? (await getCategories(db));
      // Match names in both languages, whatever language the app is in.
      const refs: CategoryRef[] = cats.map((c) => ({
        id: c.id,
        type: c.type,
        names: [c.name, STRINGS.es.categories[c.id], STRINGS.en.categories[c.id]].filter(Boolean),
      }));
      const parsed = parseSheets(sheets, refs, lang);
      const existing = new Set((await getTransactionIdentities(db)).map(transactionKey));
      const result = markDuplicates(parsed, existing);
      if (!result.budgets.length && !result.transactions.length) {
        setStep('pick');
        notify(t.importer.emptyTitle, t.importer.emptyMsg);
        return;
      }
      setPlan(result);
      setShowSkipped(false);
      setStep('review');
    } catch (e) {
      console.warn('Import failed', e);
      setStep('pick');
      notify(t.importer.readErrorTitle, t.importer.readErrorMsg);
    }
  };

  const setCategory = (id: string) => {
    if (!editing || !plan) return;
    const update = <R extends { key: string }>(rows: R[]) =>
      rows.map((r) => (r.key === editing.key ? { ...r, categoryId: id, matched: true } : r));
    setPlan(editing.kind === 'budget'
      ? { ...plan, budgets: update(plan.budgets) }
      : { ...plan, transactions: update(plan.transactions) });
    setEditing(null);
  };

  // ---------- Pick ----------
  if (step !== 'review' || !plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={t.importer.title} />
        <ScrollView contentContainerStyle={styles.pickWrap}>
          <View style={[styles.hero, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <Ionicons name="document-text-outline" size={56} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>.xlsx · .csv</Text>
          </View>
          <Text style={[styles.pickTitle, { color: colors.text }]}>{t.importer.pickTitle}</Text>
          <Muted style={{ textAlign: 'center' }}>{t.importer.pickBody}</Muted>
          {step === 'reading' ? (
            <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t.importer.reading}</Text>
              <Muted>{fileName}</Muted>
            </View>
          ) : (
            <View style={{ width: '100%', gap: 10, marginTop: 16 }}>
              <Button label={t.importer.chooseFile} icon="folder-open-outline" onPress={pick} />
              <Button
                label={t.importer.downloadTemplate}
                icon="download-outline"
                variant="soft"
                onPress={() => downloadTemplate(db, t)}
              />
            </View>
          )}
          <View style={styles.tips}>
            {t.importer.tips.map((tip) => (
              <View key={tip} style={styles.tip}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Muted style={{ flex: 1 }}>{tip}</Muted>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Review ----------
  const newTx = plan.transactions.filter((tx) => !tx.duplicate);
  const totals = budgetTotals(plan.budgets);
  const duplicates = plan.transactions.length - newTx.length;
  const unmatched = plan.budgets.filter((b) => !b.matched).length + newTx.filter((tx) => !tx.matched).length;
  const nothing = totals.size === 0 && newTx.length === 0;

  const save = async () => {
    if (nothing || saving) return;
    setSaving(true);
    try {
      const undo = await applyImport(db, totals, newTx.map((tx) => ({
        type: tx.type,
        amount_cents: tx.cents,
        category_id: tx.categoryId,
        note: tx.note,
        merchant: tx.merchant,
        date: tx.date,
        source: 'manual',
        receipt_uri: null,
      })));
      notifyDataChanged();
      showToast({
        message: t.importer.done(totals.size, newTx.length),
        actionLabel: t.toast.undo,
        onAction: async () => {
          hideToast();
          await undoImport(db, undo);
          notifyDataChanged();
        },
      });
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const pickerCategories: Category[] = (categories ?? []).filter((c) => c.type === editing?.type);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t.importer.title} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14, paddingBottom: 24 }}>
        {/* Summary */}
        <Card style={{ gap: 8 }}>
          <View style={styles.fileRow}>
            <Ionicons name="document-text" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>{fileName}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
            {[totals.size ? t.importer.budgets(totals.size) : '', newTx.length ? t.importer.transactions(newTx.length) : '']
              .filter(Boolean)
              .join(' · ') || t.importer.nothingNew}
          </Text>
          {duplicates > 0 && <Notice icon="copy-outline" color={colors.textMuted} text={t.importer.duplicates(duplicates)} />}
          {unmatched > 0 && <Notice icon="warning" color={colors.warning} text={t.importer.unmatched(unmatched)} />}
          {plan.skipped.length > 0 && <Notice icon="remove-circle-outline" color={colors.textMuted} text={t.importer.skipped(plan.skipped.length)} />}
          <Muted style={{ fontSize: 12 }}>{t.importer.currencyNote(CURRENCY_SYMBOL[currency])}</Muted>
        </Card>

        {/* Budgets */}
        {plan.budgets.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionLabel text={t.importer.budgetsSection} />
            <Card style={{ paddingVertical: 4 }}>
              {plan.budgets.map((b, i) => {
                const cat = byId.get(b.categoryId);
                return (
                  <Row
                    key={b.key}
                    last={i === plan.budgets.length - 1}
                    icon={cat?.icon ?? 'help'}
                    color={cat?.color ?? colors.textMuted}
                    title={nameOf(b.categoryId)}
                    subtitle={`${b.matched && normalizeEq(b.label, nameOf(b.categoryId)) ? '' : `“${b.label}” · `}${t.importer.row(b.row)}`}
                    warning={!b.matched}
                    amount={formatMoney(b.cents, currency)}
                    onPress={() => setEditing({ kind: 'budget', key: b.key, type: 'expense' })}
                  />
                );
              })}
            </Card>
            {plan.budgets.length > totals.size && <Muted style={{ fontSize: 12 }}>{t.importer.budgetsHint}</Muted>}
          </View>
        )}

        {/* Transactions */}
        {plan.transactions.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionLabel text={t.importer.transactionsSection} />
            <Card style={{ paddingVertical: 4 }}>
              {plan.transactions.slice(0, MAX_ROWS).map((tx, i, shown) => {
                const cat = byId.get(tx.categoryId);
                const title = tx.merchant || tx.note || tx.label || nameOf(tx.categoryId);
                const catText = tx.matched ? nameOf(tx.categoryId) : `“${tx.label || '—'}” → ${nameOf(tx.categoryId)}`;
                return (
                  <Row
                    key={tx.key}
                    last={i === shown.length - 1}
                    icon={cat?.icon ?? 'help'}
                    color={cat?.color ?? colors.textMuted}
                    title={title}
                    subtitle={`${catText} · ${shortDate(tx.date, lang)}`}
                    warning={!tx.matched && !tx.duplicate}
                    badge={tx.duplicate ? t.importer.duplicate : undefined}
                    dimmed={tx.duplicate}
                    amount={`${tx.type === 'income' ? '+' : '−'}${formatMoney(tx.cents, currency)}`}
                    amountColor={tx.type === 'income' ? colors.income : colors.text}
                    onPress={tx.duplicate ? undefined : () => setEditing({ kind: 'tx', key: tx.key, type: tx.type })}
                  />
                );
              })}
            </Card>
            {plan.transactions.length > MAX_ROWS && (
              <Muted style={{ textAlign: 'center' }}>{t.importer.andMore(plan.transactions.length - MAX_ROWS)}</Muted>
            )}
          </View>
        )}

        {/* Skipped rows */}
        {plan.skipped.length > 0 && (
          <View>
            <Pressable
              onPress={() => setShowSkipped((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showSkipped }}
              style={styles.collapse}
            >
              <SectionLabel text={t.importer.skippedSection(plan.skipped.length)} />
              <Ionicons name={showSkipped ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
            {showSkipped && (
              <Card style={{ gap: 6 }}>
                {plan.skipped.map((s) => (
                  <Muted key={`${s.sheet}:${s.row}`}>
                    {s.sheet} · {t.importer.row(s.row)}: {t.importer.reason[s.reason]}
                  </Muted>
                ))}
              </Card>
            )}
          </View>
        )}

        <Pressable onPress={() => { setPlan(null); setStep('pick'); }} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{t.importer.otherFile}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
        <Button
          label={nothing ? t.importer.nothingNew : t.importer.importButton(totals.size, newTx.length)}
          icon="checkmark"
          onPress={save}
          disabled={nothing || saving}
        />
      </View>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} accessibilityLabel={t.common.close} />
          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{t.importer.chooseCategory}</Text>
            <CategoryPicker categories={pickerCategories} selected={null} onSelect={setCategory} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const normalizeEq = (a: string, b: string) =>
  a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() ===
  b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function Header({ title }: { title: string }) {
  const { colors, t } = useApp();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => closeModal()} hitSlop={12} accessibilityLabel={t.common.close}>
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  const { colors } = useApp();
  return <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 }}>{text}</Text>;
}

function Notice({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  const { colors } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 1 }} />
      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{text}</Text>
    </View>
  );
}

function Row(props: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  amount: string;
  amountColor?: string;
  warning?: boolean;
  badge?: string;
  dimmed?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!props.onPress}
      accessibilityRole={props.onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: props.last ? 0 : StyleSheet.hairlineWidth,
          opacity: props.dimmed ? 0.45 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <CategoryIcon icon={props.icon} color={props.color} size={36} />
      <View style={{ flex: 1, minWidth: 64 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{props.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {props.warning && <Ionicons name="warning" size={13} color={colors.warning} />}
          {props.badge && (
            <Text style={[styles.badge, { color: colors.textMuted, borderColor: colors.border }]}>{props.badge}</Text>
          )}
          <Text style={{ color: props.warning ? colors.warning : colors.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {props.subtitle}
          </Text>
        </View>
      </View>
      <Text style={{ color: props.amountColor ?? colors.text, fontWeight: '700', fontSize: 14, flexShrink: 0, fontVariant: ['tabular-nums'] }}>
        {props.amount}
      </Text>
      {props.onPress && <Ionicons name="chevron-down" size={14} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  pickWrap: { alignItems: 'center', padding: 24, gap: 10 },
  hero: { width: 160, height: 160, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 16 },
  pickTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  tips: { marginTop: 20, gap: 8, alignSelf: 'stretch' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  badge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, overflow: 'hidden' },
  collapse: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
});
