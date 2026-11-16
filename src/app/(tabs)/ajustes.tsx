import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, Muted, Title, type IconName } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { clearTransactions, countTransactions, getAllTransactions, seedDemoData } from '../../lib/db';
import { transactionsToCsv } from '../../lib/csv';
import { confirmAction, notify } from '../../lib/dialog';
import { formatMoney, toISODate, type Currency } from '../../lib/format';
import { ocrAvailable } from '../../lib/ocr';

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const { colors, currency, setCurrency, themeMode, setThemeMode, notifyDataChanged, showToast } = useApp();

  // Amounts are stored as plain numbers, so switching currency only relabels them.
  const changeCurrency = async (c: Currency) => {
    if (c === currency) return;
    if ((await countTransactions(db)) === 0) return setCurrency(c);
    confirmAction({
      title: `Cambiar a ${c === 'USD' ? 'dólares' : 'colones'}`,
      message:
        'Tus montos no se convierten: solo cambia el símbolo. ' +
        `Por ejemplo, ${formatMoney(1805200, currency)} se mostrará como ${formatMoney(1805200, c)}.`,
      confirmLabel: 'Cambiar',
      onConfirm: () => setCurrency(c),
    });
  };

  const loadDemo = () =>
    confirmAction({
      title: 'Cargar datos demo',
      message: 'Reemplaza tus movimientos actuales por datos de ejemplo.',
      confirmLabel: 'Cargar',
      onConfirm: async () => {
        await seedDemoData(db);
        notifyDataChanged();
        showToast({ message: 'Datos demo cargados' });
      },
    });

  const clearAll = () =>
    confirmAction({
      title: 'Borrar todo',
      message: 'Se eliminarán todos los movimientos. No se puede deshacer.',
      confirmLabel: 'Borrar',
      destructive: true,
      onConfirm: async () => {
        await clearTransactions(db);
        notifyDataChanged();
        showToast({ message: 'Se borraron todos los movimientos' });
      },
    });

  const exportCsv = async () => {
    const rows = await getAllTransactions(db);
    if (rows.length === 0) return notify('Nada que exportar', 'Todavía no hay movimientos.');
    const content = transactionsToCsv(rows);
    const name = `gastico-${toISODate(new Date())}.csv`;
    const count = `${rows.length} movimiento${rows.length === 1 ? '' : 's'}`;

    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ message: `Descargado ${name} (${count})` });
      return;
    }

    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.write(content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar movimientos' });
    } else {
      notify('No se pudo compartir', 'Este dispositivo no permite compartir archivos.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <Title>Ajustes</Title>

        <Card style={{ gap: 12 }}>
          <Label>Moneda</Label>
          <View style={styles.chips}>
            <Chip label="₡ Colones" active={currency === 'CRC'} onPress={() => changeCurrency('CRC')} />
            <Chip label="$ Dólares" active={currency === 'USD'} onPress={() => changeCurrency('USD')} />
          </View>
          <Muted>Solo cambia el símbolo: los montos guardados no se convierten.</Muted>
          <Label>Tema</Label>
          <View style={styles.chips}>
            <Chip label="Sistema" icon="phone-portrait-outline" active={themeMode === 'system'} onPress={() => setThemeMode('system')} />
            <Chip label="Claro" icon="sunny-outline" active={themeMode === 'light'} onPress={() => setThemeMode('light')} />
            <Chip label="Oscuro" icon="moon-outline" active={themeMode === 'dark'} onPress={() => setThemeMode('dark')} />
          </View>
        </Card>

        <Card style={{ paddingVertical: 4 }}>
          <Item icon="sparkles-outline" label="Cargar datos demo" onPress={loadDemo} />
          <Item icon="share-outline" label="Exportar a CSV" onPress={exportCsv} />
          <Item icon="trash-outline" label="Borrar todos los movimientos" onPress={clearAll} danger last />
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Tus datos se quedan en tu teléfono</Text>
          </View>
          <Muted>
            Gastico funciona sin internet y sin cuentas. Las facturas se leen en el dispositivo con OCR
            {ocrAvailable ? ' (activo).' : ' (disponible en el APK; en Expo Go se ingresa el total a mano).'}
          </Muted>
          <Muted style={{ marginTop: 6 }}>Versión {Constants.expoConfig?.version ?? '1.0.0'}</Muted>
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
