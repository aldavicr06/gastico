import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import { useApp } from '../../lib/app-context';
import type { IconName } from '../../components/ui';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { name: 'movimientos', title: 'Movimientos', icon: 'list-outline', iconActive: 'list' },
  { name: 'presupuestos', title: 'Presupuestos', icon: 'pie-chart-outline', iconActive: 'pie-chart' },
  { name: 'ajustes', title: 'Ajustes', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? t.iconActive : t.icon} size={size} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
