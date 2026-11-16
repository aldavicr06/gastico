import { Ionicons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Card, Chip, Muted } from '../components/ui';
import { useApp } from '../lib/app-context';
import { addTransaction, getCategories } from '../lib/db';
import { CURRENCY_SYMBOL, formatMoney, inputToCents, shortDate, toISODate } from '../lib/format';
import { ocrAvailable, recognizeText } from '../lib/ocr';
import { parseReceipt, type ParsedReceipt } from '../lib/receipt';
import { notify } from '../lib/dialog';
import { closeModal } from '../lib/navigation';
import { useBudgetAlert } from '../lib/tx-actions';
import { useData } from '../lib/use-data';

type Step = 'pick' | 'reading' | 'review';

export default function ScanScreen() {
  const db = useSQLiteContext();
  const { colors, currency, notifyDataChanged } = useApp();
  const budgetAlert = useBudgetAlert();
  const categories = useData((d) => getCategories(d, 'expense'));

  const [step, setStep] = useState<Step>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [rawText, setRawText] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(toISODate(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const pick = async (from: 'camera' | 'library') => {
    const perm = from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permiso necesario', from === 'camera' ? 'Gastico necesita la cámara para leer tus facturas.' : 'Gastico necesita acceso a tus fotos.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.9 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    await read(res.assets[0].uri);
  };

  const read = async (uri: string) => {
    setImageUri(uri);
    setStep('reading');
    try {
      const lines = await recognizeText(uri);
      const p = parseReceipt(lines);
      setRawText(lines);
      setParsed(p);
      if (p.total) setAmount(String(p.total));
      if (p.merchant) setMerchant(p.merchant);
      if (p.date) setDate(p.date);
      setCategoryId(p.suggestedCategory ?? null);
      if (p.total) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('OCR failed', e);
      setParsed(null);
    }
    setStep('review');
  };

  /** Copy the photo out of the picker cache so it survives app restarts. */
  const persistImage = (uri: string): string | null => {
    try {
      const dir = new Directory(Paths.document, 'receipts');
      if (!dir.exists) dir.create();
      const src = new File(uri);
      const dest = new File(dir, `${Date.now()}.jpg`);
      src.copy(dest);
      return dest.uri;
    } catch (e) {
      console.warn('Could not keep receipt image', e);
      return uri;
    }
  };

  const cents = inputToCents(amount);

  const save = async () => {
    if (!cents || !categoryId) return;
    const afterSave = await budgetAlert(categoryId, date.slice(0, 7));
    await addTransaction(db, {
      type: 'expense',
      amount_cents: cents,
      category_id: categoryId,
      note: null,
      merchant: merchant.trim() || null,
      date,
      source: 'scan',
      receipt_uri: imageUri ? persistImage(imageUri) : null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notifyDataChanged();
    await afterSave();
    closeModal();
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => closeModal()} hitSlop={12}>
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Escanear factura</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  // ---------- Step 1: choose a photo ----------
  if (step === 'pick') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <View style={styles.pickWrap}>
          <View style={[styles.frame, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Ionicons name="receipt-outline" size={72} color={colors.primary} />
            <View style={[styles.scanLine, { backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.pickTitle, { color: colors.text }]}>Tómale foto a tu factura o voucher</Text>
          <Muted style={{ textAlign: 'center', paddingHorizontal: 24 }}>
            Gastico lee el total, el comercio y la fecha. Tú solo eliges la categoría.
          </Muted>
          <View style={{ width: '100%', gap: 10, marginTop: 20 }}>
            <Button label="Tomar foto" icon="camera" onPress={() => pick('camera')} />
            <Button label="Elegir de la galería" icon="images-outline" variant="soft" onPress={() => pick('library')} />
          </View>
          <View style={styles.tips}>
            {['Buena luz, sin sombras', 'Que se vea la línea del TOTAL', 'Funciona sin internet'].map((t) => (
              <View key={t} style={styles.tip}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Muted>{t}</Muted>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Step 2: reading ----------
  if (step === 'reading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <View style={[styles.pickWrap, { justifyContent: 'center' }]}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.readingImage} />}
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
          <Text style={{ color: colors.text, fontWeight: '700', marginTop: 12 }}>Leyendo la factura…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Step 3: review & pick category ----------
  const found = !!parsed?.total;
  const otherAmounts = (parsed?.candidates ?? []).filter((c) => Math.round(c * 100) !== cents).slice(0, 4);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {imageUri && (
              <Pressable onPress={() => setStep('pick')}>
                <Image source={{ uri: imageUri }} style={styles.thumb} />
                <View style={[styles.retake, { backgroundColor: colors.card }]}>
                  <Ionicons name="refresh" size={14} color={colors.text} />
                </View>
              </Pressable>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.badge, { backgroundColor: found ? colors.primarySoft : colors.warning + '26' }]}>
                <Ionicons name={found ? 'sparkles' : 'create-outline'} size={14} color={found ? colors.primary : colors.warning} />
                <Text style={{ color: found ? colors.primary : colors.warning, fontWeight: '700', fontSize: 12 }}>
                  {found
                    ? parsed?.totalSource === 'label' ? 'Total detectado' : 'Monto más alto detectado'
                    : ocrAvailable ? 'No encontré el total' : 'Ingresa el total'}
                </Text>
              </View>
              {!ocrAvailable && (
                <Muted style={{ fontSize: 12 }}>La lectura automática funciona en el APK (no en Expo Go).</Muted>
              )}
            </View>
          </View>

          <Card style={{ gap: 6 }}>
            <Muted>Total</Muted>
            <View style={styles.amountRow}>
              <Text style={[styles.amountSymbol, { color: colors.textMuted }]}>{CURRENCY_SYMBOL[currency]}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={[styles.amountInput, { color: colors.text }]}
              />
            </View>
            {otherAmounts.length > 0 && (
              <View style={{ gap: 8 }}>
                <Muted style={{ fontSize: 12 }}>¿No es ese? Otros montos en la factura:</Muted>
                <View style={styles.wrap}>
                  {otherAmounts.map((c) => (
                    <Chip key={c} label={formatMoney(Math.round(c * 100), currency)} active={false} onPress={() => setAmount(String(c))} />
                  ))}
                </View>
              </View>
            )}
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[styles.field, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="storefront-outline" size={18} color={colors.textMuted} />
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Comercio"
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, color: colors.text, fontSize: 15 }}
              />
            </View>
            <Pressable
              onPress={() => setDate(toISODate(new Date()))}
              style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 15 }}>{shortDate(date)}</Text>
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>¿Qué tipo de gasto es?</Text>
            <CategoryPicker
              categories={categories ?? []}
              selected={categoryId}
              suggested={parsed?.suggestedCategory}
              onSelect={setCategoryId}
            />
          </View>

          {rawText.length > 0 && (
            <Pressable onPress={() => setShowRaw((s) => !s)}>
              <Muted style={{ textAlign: 'center' }}>{showRaw ? 'Ocultar' : 'Ver'} texto detectado</Muted>
            </Pressable>
          )}
          {showRaw && (
            <Card>
              <Text style={{ color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 }}>
                {rawText.join('\n')}
              </Text>
            </Card>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <Button
            label={!cents ? 'Ingresa el total' : !categoryId ? 'Elige la categoría' : `Guardar ${formatMoney(cents, currency)}`}
            icon="checkmark"
            onPress={save}
            disabled={!cents || !categoryId}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  pickWrap: { flex: 1, alignItems: 'center', padding: 24, gap: 10 },
  frame: { width: 200, height: 240, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  scanLine: { position: 'absolute', left: 20, right: 20, top: '55%', height: 3, borderRadius: 2, opacity: 0.7 },
  pickTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  tips: { marginTop: 24, gap: 8, alignSelf: 'flex-start' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readingImage: { width: 200, height: 280, borderRadius: 20 },
  thumb: { width: 72, height: 96, borderRadius: 14 },
  retake: { position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountSymbol: { fontSize: 32, fontWeight: '800' },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '900', paddingVertical: 0, letterSpacing: -1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
