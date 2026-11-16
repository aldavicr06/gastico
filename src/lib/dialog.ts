import { Alert } from 'react-native';

/**
 * App dialogs, drawn by <DialogHost> so they look the same on phone and web
 * (React Native's Alert does nothing on web, and the browser's confirm()
 * looks out of place and blocks the page).
 */
export type DialogRequest = {
  title: string;
  message: string;
  /** Omit for an info dialog with a single "Entendido" button. */
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
};

let show: ((d: DialogRequest) => void) | null = null;

/** Called by <DialogHost> on mount; returns the unregister function. */
export function registerDialogHost(fn: (d: DialogRequest) => void) {
  show = fn;
  return () => {
    if (show === fn) show = null;
  };
}

function open(d: DialogRequest) {
  if (show) return show(d);
  // Fallback before the host mounts (should not happen in practice).
  Alert.alert(d.title, d.message, d.onConfirm
    ? [{ text: 'Cancelar', style: 'cancel' }, { text: d.confirmLabel ?? 'Aceptar', onPress: () => void d.onConfirm?.() }]
    : undefined);
}

export function notify(title: string, message: string) {
  open({ title, message });
}

/** Asks before a destructive or replacing action; runs `onConfirm` only on "yes". */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  open(opts);
}
