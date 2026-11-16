import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useApp } from '../lib/app-context';
import { radius, space } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useApp();
  return <Text style={[styles.title, { color: colors.text }, style]}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: colors.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { colors } = useApp();
  return <Text numberOfLines={numberOfLines} style={[{ color: colors.textMuted, fontSize: 13 }, style]}>{children}</Text>;
}

export function CategoryIcon({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: color + '26',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as IconName} size={size * 0.5} color={color} />
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, icon, variant = 'primary', disabled, style }: ButtonProps) {
  const { colors } = useApp();
  const bg =
    variant === 'primary' ? colors.primary
    : variant === 'soft' ? colors.primarySoft
    : variant === 'danger' ? colors.danger + '1F'
    : 'transparent';
  const fg =
    variant === 'primary' ? colors.onPrimary
    : variant === 'danger' ? colors.danger
    : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={fg} />}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: IconName }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.cardAlt,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.textMuted} />}
      <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color: string; height?: number }) {
  const { colors } = useApp();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

/** Green → amber → red as the budget fills up. */
export function budgetColor(ratio: number, colors: { income: string; warning: string; danger: string }) {
  if (ratio >= 1) return colors.danger;
  if (ratio >= 0.8) return colors.warning;
  return colors.income;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space(6),
    marginBottom: space(3),
  },
  section: { fontSize: 17, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    paddingVertical: space(3.5),
    paddingHorizontal: space(5),
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
});
