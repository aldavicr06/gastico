import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const TITLES: Record<string, string> = {
  '/': 'Inicio',
  '/movimientos': 'Movimientos',
  '/presupuestos': 'Presupuestos',
  '/ajustes': 'Ajustes',
  '/add': 'Agregar',
  '/scan': 'Escanear factura',
};

/** Web only: keeps the browser tab title as "<Pantalla> · Gastico" while navigating. */
export function useDocumentTitle() {
  const pathname = usePathname();
  const { id } = useGlobalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const screen = pathname === '/add' && id ? 'Editar movimiento' : TITLES[pathname];
    document.title = screen ? `${screen} · Gastico` : 'Gastico';
  }, [pathname, id]);
}
