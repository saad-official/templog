import { motion } from '@templog/shared/tokens';
import { useEffect } from 'react';
import { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { easing } from './motion';

type ColorProp = 'backgroundColor' | 'borderColor' | 'color';

/**
 * Cross-fades a colour style when it changes (theme flip, pass → fail preview) on the UI thread.
 * Starts from the colour on screen, so a change mid-fade never jumps. Reduced motion → instant.
 * Hex / rgba strings only (never PlatformColor).
 */
export function useAnimatedColor(color: string, prop: ColorProp = 'backgroundColor', duration: number = motion.duration.base) {
  const reduced = useReducedMotion();
  const from = useSharedValue(color);
  const to = useSharedValue(color);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (to.get() === color) return;
    const current = interpolateColor(progress.get(), [0, 1], [from.get(), to.get()]) as string;
    from.set(current);
    to.set(color);
    progress.set(0);
    progress.set(withTiming(1, { duration: reduced ? 0 : duration, easing: easing.standard }));
  }, [color, from, to, progress, reduced, duration]);

  return useAnimatedStyle(() => {
    const value = interpolateColor(progress.get(), [0, 1], [from.get(), to.get()]);
    if (prop === 'borderColor') return { borderColor: value };
    if (prop === 'color') return { color: value };
    return { backgroundColor: value };
  });
}
