import type { SparkPoint } from '@templog/shared/compliance';
import type { Limits } from '@templog/shared/schemas';
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type SparklineProps = {
  points: readonly SparkPoint[];
  /** Checkpoint limits (°F): drawn as dashed lines so out-of-range points read at a glance. */
  limits?: Limits;
  height?: number;
  /** Spoken summary (min / max / fails), e.g. from the stats. */
  accessibilityLabel: string;
};

const DOT = 6;
const FAIL_DOT = 10;
const LINE = 2;

/**
 * A sparkline from plain Views (no SVG): one rotated bar per segment, a dot per reading (fails are
 * larger heat dots), dashed limit lines. Values stay in °F; only the shape is drawn.
 */
export function Sparkline({ points, limits, height = 96, accessibilityLabel }: SparklineProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const values = points.map((p) => p.valueF);
  const bounds = [...values, ...(limits?.min !== undefined ? [limits.min] : []), ...(limits?.max !== undefined ? [limits.max] : [])];
  const lo = bounds.length ? Math.min(...bounds) : 0;
  const hi = bounds.length ? Math.max(...bounds) : 1;
  const pad = Math.max(1, (hi - lo) * 0.12);
  const min = lo - pad;
  const max = hi + pad;
  const inner = height - FAIL_DOT;
  const y = (v: number) => FAIL_DOT / 2 + (1 - (v - min) / (max - min)) * inner;
  const x = (i: number) => (points.length <= 1 ? width / 2 : FAIL_DOT / 2 + (i / (points.length - 1)) * (width - FAIL_DOT));

  const coords = width ? points.map((p, i) => ({ x: x(i), y: y(p.valueF), fail: p.result === 'fail' })) : [];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, direction: 'ltr' }}
    >
      {points.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="callout" tone="tertiary">
            No readings in this period
          </AppText>
        </View>
      ) : null}
      {width && limits
        ? [limits.min, limits.max]
            .filter((v): v is number => v !== undefined)
            .map((v) => (
              <View
                key={`limit-${v}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: y(v),
                  borderTopWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.heat,
                  opacity: 0.7,
                }}
              />
            ))
        : null}
      {coords.slice(1).map((c, i) => {
        const a = coords[i]!;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        return (
          <View
            key={`seg-${i}`}
            style={{
              position: 'absolute',
              left: (a.x + c.x) / 2 - length / 2,
              top: (a.y + c.y) / 2 - LINE / 2,
              width: length,
              height: LINE,
              borderRadius: LINE,
              backgroundColor: colors.textSecondary,
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      })}
      {coords.map((c, i) => {
        const size = c.fail ? FAIL_DOT : DOT;
        return (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: c.x - size / 2,
              top: c.y - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: c.fail ? colors.heat : colors.text,
              borderWidth: c.fail ? 2 : 0,
              borderColor: colors.surfaceElevated,
            }}
          />
        );
      })}
    </View>
  );
}
