// Reanimated-ready motion values built from the shared tokens.
import { motion } from '@templog/shared/tokens';
import { cubicBezier, Easing } from 'react-native-reanimated';

/** `withTiming` easings. */
export const easing = {
  standard: Easing.bezier(...motion.easing.standard),
  exit: Easing.bezier(...motion.easing.exit),
  /** Strong ease-out for things entering. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
} as const;

/** Reanimated CSS-transition timing functions. */
export const cssEasing = {
  standard: cubicBezier(...motion.easing.standard),
  out: cubicBezier(0.23, 1, 0.32, 1),
} as const;

/** `withSpring` configs: `snappy` for keys, stamps and the settling value; `gentle` for rings and cards. */
export const springs = motion.spring;
