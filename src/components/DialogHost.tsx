import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import { registerDialogHost, type DialogRequest } from '../lib/dialog';
import { Button } from './ui';

/** Renders the app's confirm / info dialogs (see lib/dialog.ts). */
export function DialogHost() {
  const { colors, t } = useApp();
  const [dialog, setDialog] = useState<DialogRequest | null>(null);

  useEffect(() => registerDialogHost(setDialog), []);

  const close = () => setDialog(null);
  const confirm = () => {
    const run = dialog?.onConfirm;
    close();
    void run?.();
  };

  return (
    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t.common.close} />
        {dialog && (
          <View
            accessibilityRole="alert"
            aria-modal
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.title, { color: colors.text }]}>{dialog.title}</Text>
            <Text style={[styles.message, { color: colors.textMuted }]}>{dialog.message}</Text>
            <View style={styles.actions}>
              {dialog.onConfirm ? (
                <>
                  <Button label={t.common.cancel} variant="ghost" onPress={close} style={styles.button} />
                  <Button
                    label={dialog.confirmLabel ?? t.common.ok}
                    variant={dialog.destructive ? 'danger' : 'primary'}
                    onPress={confirm}
                    style={styles.button}
                  />
                </>
              ) : (
                <Button label={t.common.gotIt} onPress={close} style={styles.button} />
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 22, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '800' },
  message: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  button: { flexGrow: 1, flexBasis: 120, paddingVertical: 12 },
});
