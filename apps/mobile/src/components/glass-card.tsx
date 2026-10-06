import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceTransparency } from '@/hooks/use-accessibility';
import { hairline, radius as radii, spacing, useTheme, withAlpha, type RadiusToken } from '@/theme';

const CAN_GLASS = process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Whether the platform renders real Liquid Glass (used to avoid glass-on-glass). */
export const supportsLiquidGlass = CAN_GLASS;

export type GlassTint = 'none' | 'heat' | 'cold' | 'warning';

export type GlassCardProps = {
  children: ReactNode;
  radius?: RadiusToken;
  padding?: number;
  /** Tints the glass (overdue → heat, due → warning). */
  tint?: GlassTint;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The floating "due now" card, and nothing else: Liquid Glass on iOS 26, a system material blur on
 * older iOS, a solid elevated surface on Android or with Reduce Transparency. Never nested, never
 * opacity-animated (animate the content instead).
 */
export function GlassCard({ children, radius = 'lg', padding = spacing.md, tint = 'none', gap, style }: GlassCardProps) {
  const { colors, shadow, isDark } = useTheme();
  const reduce = useReduceTransparency();
  const shape: ViewStyle = { borderRadius: radii[radius], borderCurve: 'continuous', padding, gap };
  const soft = tint === 'heat' ? colors.heatSoft : tint === 'cold' ? colors.coldSoft : tint === 'warning' ? colors.warningSoft : undefined;

  if (CAN_GLASS && !reduce) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={soft ? withAlpha(soft, 0.7) : undefined} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  if (process.env.EXPO_OS === 'ios' && !reduce) {
    return (
      // No boxShadow here: the material is translucent, and RN masks the shadow with a circular-corner
      // rect while the blur uses continuous corners, so a dark rim showed through at the corners.
      <View style={[{ borderRadius: radii[radius], borderCurve: 'continuous' }, style]}>
        <BlurView
          tint={isDark ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
          intensity={90}
          style={[shape, { overflow: 'hidden' }]}
        >
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: soft ?? colors.surfaceElevated, opacity: 0.5 }}
          />
          {children}
        </BlurView>
      </View>
    );
  }
  // Solid: a shadow cannot lift a card off near-black steel, so dark mode adds a hairline edge.
  const edge: ViewStyle | null = isDark ? { borderWidth: hairline, borderColor: colors.border } : null;
  return <View style={[shape, { backgroundColor: soft ?? colors.surfaceElevated, boxShadow: shadow('md') }, edge, style]}>{children}</View>;
}
