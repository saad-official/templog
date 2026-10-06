import { View, type DimensionValue } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { radius as radii, spacing, useTheme, type RadiusToken } from '@/theme';

const PULSE = {
  from: { opacity: 1 },
  to: { opacity: 0.5 },
};

/** A placeholder block that softly pulses (static with Reduce Motion). */
export function Skeleton({ width = '100%', height = 16, radius = 'sm' }: { width?: DimensionValue; height?: number; radius?: RadiusToken }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessible={false}
      style={{
        width,
        height,
        borderRadius: radii[radius],
        backgroundColor: colors.fill,
        ...(reduced
          ? null
          : {
              animationName: PULSE,
              animationDuration: 900,
              animationIterationCount: 'infinite',
              animationDirection: 'alternate',
              animationTimingFunction: 'ease-in-out',
            }),
      }}
    />
  );
}

/** Rows of skeletons shaped like a list group (first load, network-backed screens). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.md, padding: spacing.md, gap: spacing.lg }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Skeleton width={40} height={40} radius="pill" />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={64} height={28} radius="pill" />
        </View>
      ))}
    </View>
  );
}
