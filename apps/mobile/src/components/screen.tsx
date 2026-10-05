import type { ReactNode, Ref } from 'react';
import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { spacing, useAnimatedColor, useTheme } from '@/theme';

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ScrollView>;
};

/**
 * Scrollable screen body. The ScrollView is the first child of the route so the native header
 * (large-title collapse) and tab-bar insets work; safe areas come from
 * `contentInsetAdjustmentBehavior`, never hand-made margins. The steel background cross-fades on a
 * theme change.
 */
export function Screen({ children, contentStyle, style, ref, ...props }: ScreenProps) {
  const { colors } = useTheme();
  const background = useAnimatedColor(colors.surface);
  return (
    <Animated.ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={[{ flex: 1 }, background, style]}
      contentContainerStyle={[
        { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
        contentStyle,
      ]}
      {...props}
    >
      {children}
    </Animated.ScrollView>
  );
}
