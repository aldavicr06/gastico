import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, Muted, Title, type IconName } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { clearTransactions, getAllTransactions, seedDemoData } from '../../lib/db';
import { ocrAvailable } from '../../lib/ocr';

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const { colors, currency, setCurrency, themeMode, setThemeMode, notifyDataChanged } = useApp();

  const loadDemo = () =>
    Alert.alert('Cargar datos demo', 'Reemplaza tus movimientos actuales por datos de ejemplo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cargar',
        onPress: async () => {
          await seedDemoData(db);
          notifyDataChanged();
        },
      },
    ]);

  const clearAll = () =>
    Alert.alert('Borrar todo', 'Se eliminarán todos los movimientos. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await clearTransactions(db);
          notifyDataChanged();
        },
      },
    ]);

  const exportCsv = async () => {
    const rows = await getAllTransactions(db);
    if (rows.length === 0) return Alert.alert('Nada que exportar', 'Todavía no hay movimientos.');
    const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'fecha,tipo,categoria,comercio,nota,monto,origen',
      ...rows.map((r) =>
        [r.date, r.type === 'expense' ? 'gasto' : 'ingreso', esc(r.category_name), esc(r.merchant), esc(r.note), (r.amount_cents / 100).toFixed(2), r.source].join(','),
      ),
    ].join('\n');
    const file = new File(Paths.cache, `gastico-${Date.now()}.csv`);
    file.write(csv);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar movimientos' });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <Title>Ajustes</Title>

        <Card style={{ gap: 12 }}>
          <Label>Moneda</Label>
          <View style={styles.chips}>
            <Chip label="₡ Colones" active={currency === 'CRC'} onPress={() => setCurrency('CRC')} />
            <Chip label="$ Dólares" active={currency === 'USD'} onPress={() => setCurrency('USD')} />
          </View>
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
