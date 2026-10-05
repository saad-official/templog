// One theme entry point: `import { spacing, useTheme, textStyles } from '@/theme'`.
// Values come from `@templog/shared/tokens`; this folder only resolves them for React Native:
// colour scheme, Reanimated easings, text styles.
import { Platform, StyleSheet } from 'react-native';

export { fontWeight, motion, radius, shadows, spacing, type } from '@templog/shared/tokens';
export type { ColorScheme, RadiusToken, ShadowLevel, SpacingToken, TypeToken } from '@templog/shared/tokens';
export { cssEasing, easing, springs } from './motion';
export { buildAppTheme, withAlpha, type AppTheme, type ThemeColors } from './palette';
export { AppThemeProvider } from './theme-provider';
export { ThemeContext, useTheme } from './theme-context';
export { CHROME_FONT_CAP, tabular, textStyles, typeStyle } from './typography';
export { useAnimatedColor } from './use-animated-color';

/** One device pixel: list separators only. */
export const hairline = StyleSheet.hairlineWidth;

/** Minimum touch target (HIG 44 pt / Material 48 dp). */
export const touchTarget = Platform.select({ android: 48, default: 44 });

/** Big kitchen targets (gloved, greasy, in a hurry): Log buttons, the keypad Save. */
export const bigTarget = 60;

/** Keypad key height. */
export const keyHeight = 64;

/** Keypad key height on short screens. */
export const compactKeyHeight = 52;

/** Hairline-plus stroke for stamps and focus rings. */
export const strokeWidth = 2;
