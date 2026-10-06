import { useState } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { IconName } from '@/constants/icons';
import { bigTarget, CHROME_FONT_CAP, cssEasing, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/**
 * `primary`: ink on steel, the default action. `heat`: an action about a fail or a cooling timer
 * (corrective action, Log cooling reading). `secondary`: sunken steel. `ghost`: text only.
 * `destructive`: delete / discard, heat text on a soft heat tint.
 */
export type ButtonVariant = 'primary' | 'heat' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

export type PrimaryButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** `lg` = 60 pt kitchen targets (Log, Save); `md` = 48 pt. */
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default true). */
  block?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** The app's button: pressed feedback is a 3% scale in 120 ms, on press-in. */
export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  block = true,
  accessibilityLabel,
  accessibilityHint,
  style,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || !!loading;

  const enabled = {
    primary: { bg: colors.action, fg: colors.onAction },
    heat: { bg: colors.heat, fg: colors.onHeat },
    secondary: { bg: colors.fill, fg: colors.text },
    ghost: { bg: 'transparent', fg: colors.text },
    destructive: { bg: colors.heatSoft, fg: colors.heatText },
  }[variant];
  // Disabled reads as inert steel, not a washed-out fill (45% ink / heat turned muddy grey or brown,
  // worst in dark mode). Loading keeps the variant so the spinner stays on the action's colour.
  const fill = disabled ? { bg: variant === 'ghost' ? 'transparent' : colors.fill, fg: colors.textTertiary } : enabled;

  const height = size === 'lg' ? bigTarget : Math.max(touchTarget, 48);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      style={[block ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
    >
      <Animated.View
        style={{
          minHeight: height,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xs,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: fill.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          transform: [{ scale: pressed && !inactive ? 0.97 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        {loading ? (
          <ActivityIndicator color={fill.fg} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} color={fill.fg} weight="semibold" /> : null}
            <AppText
              variant={size === 'lg' ? 'headline' : 'callout'}
              weight="600"
              maxFontSizeMultiplier={CHROME_FONT_CAP}
              style={{ color: fill.fg, flexShrink: 1 }}
              numberOfLines={2}
              align="center"
            >
              {title}
            </AppText>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
