import { BottomSheet, Host } from '@expo/ui';
import { Pressable, View } from 'react-native';

import type { IconName } from '@/constants/icons';
import { spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export type SheetAction = {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Native modal bottom sheet listing contextual actions: Android's long-press idiom (iOS uses
 * `Link.Menu` context menus instead).
 */
export function ActionSheet({ title, actions, visible, onClose }: { title?: string; actions: SheetAction[]; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Host matchContents style={{ position: 'absolute' }}>
      <BottomSheet isPresented={visible} onDismiss={onClose} containerColor={colors.surfaceElevated}>
        <View style={{ paddingBottom: spacing.lg }}>
          {title ? (
            <AppText variant="callout" tone="secondary" numberOfLines={2} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
              {title}
            </AppText>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => ({
                minHeight: touchTarget + spacing.xs,
                paddingHorizontal: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
              })}
            >
              <Icon name={a.icon} size={22} color={a.destructive ? colors.heatText : colors.textSecondary} />
              <AppText variant="body" tone={a.destructive ? 'heat' : 'primary'}>
                {a.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </Host>
  );
}
