import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import { useApp } from '../../lib/app-context';
import type { IconName } from '../../components/ui';
import type { Strings } from '../../lib/i18n';

const TABS: { name: string; title: keyof Strings['tabs']; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'home', icon: 'home-outline', iconActive: 'home' },
  { name: 'movimientos', title: 'transactions', icon: 'list-outline', iconActive: 'list' },
  { name: 'presupuestos', title: 'budgets', icon: 'pie-chart-outline', iconActive: 'pie-chart' },
  { name: 'ajustes', title: 'settings', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const { colors, t: tr } = useApp();
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
            title: tr.tabs[t.title],
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? t.iconActive : t.icon} size={size} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
