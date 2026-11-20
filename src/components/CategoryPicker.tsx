import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import type { Category } from '../lib/db';
import { categoryName } from '../lib/i18n';
import { CategoryIcon } from './ui';

/** 4-column grid of categories. Shows a ✨ badge on the suggested one. */
export function CategoryPicker({
  categories,
  selected,
  suggested,
  onSelect,
}: {
  categories: Category[];
  selected: string | null;
  suggested?: string | null;
  onSelect: (id: string) => void;
}) {
  const { colors, t } = useApp();
  return (
    <View style={styles.grid}>
      {categories.map((c) => {
        const active = c.id === selected;
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={[
              styles.item,
              {
                backgroundColor: active ? c.color + '22' : colors.card,
                borderColor: active ? c.color : colors.border,
              },
            ]}
          >
            <CategoryIcon icon={c.icon} color={c.color} size={36} />
            <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{categoryName(t, c.id, c.name)}</Text>
            {suggested === c.id && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Ionicons name="sparkles" size={10} color={colors.onPrimary} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: {
    width: '23.5%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 6,
  },
  label: { fontSize: 12, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
