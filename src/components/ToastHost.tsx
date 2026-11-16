import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app-context';

const TAB_BAR_HEIGHT = 64;
const MODAL_ROUTES = ['/add', '/scan'];
/** Screens with the floating "+" button in the bottom-right corner. */
const FAB_ROUTES = ['/movimientos'];
const FAB_SIZE = 60;

/** Bottom snackbar for the app-wide toast (undo, budget alerts). */
export function ToastHost() {
  const { toast, hideToast, colors } = useApp();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const onModal = MODAL_ROUTES.includes(pathname);

  // Opening the add/scan form dismisses any pending toast so it can never sit
  // over the "Guardar" button. A toast raised by saving there shows once the
  // form closes.
  useEffect(() => {
    if (onModal) hideToast();
  }, [onModal, hideToast]);

  if (!toast || onModal) return null;

  // Sit above the tab bar, and leave the "+" button free where there is one.
  const bottom = insets.bottom + 12 + TAB_BAR_HEIGHT;
  const right = FAB_ROUTES.includes(pathname) ? 16 + FAB_SIZE + 12 : 16;
  const warning = toast.tone === 'warning';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom, right }]}>
      <View
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: colors.dark ? colors.cardAlt : '#1F2A25' }]}
      >
        {warning && <Ionicons name="warning" size={18} color={colors.warning} />}
        <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
        {toast.actionLabel && toast.onAction ? (
          <Pressable onPress={toast.onAction} hitSlop={10}>
            <Text style={[styles.action, { color: colors.dark ? colors.primary : '#5EEAB4' }]}>{toast.actionLabel}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={hideToast} hitSlop={10} accessibilityLabel="Cerrar aviso">
            <Ionicons name="close" size={18} color="#C9D3CE" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 480,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { flex: 1, color: '#F1F5F3', fontSize: 14, fontWeight: '600' },
  action: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
