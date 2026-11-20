import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, Muted, Title, type IconName } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { clearTransactions, getAllTransactions, seedDemoData } from '../../lib/db';
import { transactionsToCsv } from '../../lib/csv';
import { downloadTemplate, saveFile } from '../../lib/files';
import { confirmAction, notify } from '../../lib/dialog';
import { toISODate } from '../../lib/format';
import { ocrAvailable } from '../../lib/ocr';
import { useChangeCurrency } from '../../lib/tx-actions';

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const { colors, currency, setCurrency, themeMode, setThemeMode, notifyDataChanged, showToast, t, lang, setLang } = useApp();
  const changeCurrency = useChangeCurrency();

  const loadDemo = () =>
    confirmAction({
      title: t.settings.loadDemo,
      message: t.settings.loadDemoMsg,
      confirmLabel: t.settings.load,
      onConfirm: async () => {
        // The demo comes in the currency in use, with the stores of the language.
        setCurrency(await seedDemoData(db, lang, currency));
        notifyDataChanged();
        showToast({ message: t.settings.demoLoaded });
      },
    });

  const clearAll = () =>
    confirmAction({
      title: t.settings.clearTitle,
      message: t.settings.clearMsg,
      confirmLabel: t.settings.delete,
      destructive: true,
      onConfirm: async () => {
        await clearTransactions(db);
        notifyDataChanged();
        showToast({ message: t.settings.cleared });
      },
    });

  const exportCsv = async () => {
    const rows = await getAllTransactions(db);
    if (rows.length === 0) return notify(t.settings.nothingTitle, t.settings.nothingMsg);
    const content = transactionsToCsv(rows, t);
    const name = `gastico-${toISODate(new Date())}.csv`;
    const count = t.settings.count(rows.length);
    const shared = await saveFile(name, content, {
      mimeType: 'text/csv;charset=utf-8',
      uti: 'public.comma-separated-values-text',
      dialogTitle: t.settings.exportTitle,
    });
    if (!shared) return notify(t.settings.shareFailTitle, t.settings.shareFailMsg);
    // The browser downloads silently; on phones the share sheet already confirms.
    if (Platform.OS === 'web') showToast({ message: t.settings.downloaded(name, count) });
  };

  const getTemplate = async () => {
    if (!(await downloadTemplate(db, t))) return notify(t.settings.shareFailTitle, t.settings.shareFailMsg);
    if (Platform.OS === 'web') showToast({ message: t.importer.templateSaved(t.importer.template.fileName) });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <Title>{t.settings.title}</Title>

        <Card style={{ gap: 12 }}>
          <Label>{t.settings.language}</Label>
          <View style={styles.chips}>
            <Chip label="Español" icon="language-outline" active={lang === 'es'} onPress={() => setLang('es')} />
            <Chip label="English" icon="language-outline" active={lang === 'en'} onPress={() => setLang('en')} />
          </View>
          <Label>{t.settings.currency}</Label>
          <View style={styles.chips}>
            <Chip label={t.settings.colones} active={currency === 'CRC'} onPress={() => changeCurrency('CRC')} />
            <Chip label={t.settings.dollars} active={currency === 'USD'} onPress={() => changeCurrency('USD')} />
          </View>
          <Muted>{t.settings.currencyNote}</Muted>
          <Label>{t.settings.theme}</Label>
          <View style={styles.chips}>
            <Chip label={t.settings.system} icon="phone-portrait-outline" active={themeMode === 'system'} onPress={() => setThemeMode('system')} />
            <Chip label={t.settings.light} icon="sunny-outline" active={themeMode === 'light'} onPress={() => setThemeMode('light')} />
            <Chip label={t.settings.dark} icon="moon-outline" active={themeMode === 'dark'} onPress={() => setThemeMode('dark')} />
          </View>
        </Card>

        <Card style={{ paddingVertical: 4 }}>
          <Item icon="sparkles-outline" label={t.settings.loadDemo} onPress={loadDemo} />
          <Item icon="cloud-upload-outline" label={t.settings.importFile} onPress={() => router.push('/import')} />
          <Item icon="document-outline" label={t.settings.template} onPress={getTemplate} />
          <Item icon="share-outline" label={t.settings.exportCsv} onPress={exportCsv} />
          <Item icon="trash-outline" label={t.settings.clearAll} onPress={clearAll} danger last />
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t.settings.privacyTitle}</Text>
          </View>
          <Muted>{t.settings.privacyBody(ocrAvailable)}</Muted>
          <Muted style={{ marginTop: 6 }}>{t.settings.version(Constants.expoConfig?.version ?? '1.0.0')}</Muted>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 }}>{String(children).toUpperCase()}</Text>;
}

function Item({ icon, label, onPress, danger, last }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  const { colors } = useApp();
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.item,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color, fontSize: 15, fontWeight: '600', flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
});
