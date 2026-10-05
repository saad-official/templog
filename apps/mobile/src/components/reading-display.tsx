import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { CHROME_FONT_CAP, springs, textStyles, useAnimatedColor, useTheme } from '@/theme';

import { AppText } from './app-text';
import type { StampResult } from './result-stamp';

export type ReadingDisplayProps = {
  /** Entry text as typed (`38.5`, `-18`, empty). */
  text: string;
  /** `°F` / `°C`. */
  unitLabel: string;
  /** Live preview of the result; null while empty. */
  result: StampResult | null;
  /** Spoken alongside the value ("pass", "fail: above 41 °F"). */
  resultLabel?: string;
};

/**
 * The reading itself: 48-pt tabular digits that never jump width. Each key press makes the value
 * "settle" (a 3% dip springing back on the UI thread) and its colour cross-fades to the live result:
 * ink while empty, pass green, fail heat, keep-cooling amber. Reduced motion: colour only.
 */
export function ReadingDisplay({ text, unitLabel, result, resultLabel }: ReadingDisplayProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const target = !text
    ? colors.textTertiary
    : result === 'pass'
      ? colors.passText
      : result === 'fail'
        ? colors.heatText
        : result === 'pending'
          ? colors.warningText
          : colors.text;
  const color = useAnimatedColor(target, 'color');

  useEffect(() => {
    if (reduced || !text) return;
    scale.set(withSequence(withTiming(0.97, { duration: 60 }), withSpring(1, springs.snappy)));
  }, [text, reduced, scale]);

  const settle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const shown = text || '––';
  const spoken = text ? `${text} ${unitLabel}${resultLabel ? `, ${resultLabel}` : ''}` : 'No value yet';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Reading, ${spoken}`}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, direction: 'ltr' }}
    >
      <Animated.Text
        allowFontScaling
        maxFontSizeMultiplier={1.4}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[textStyles.display, color, settle]}
      >
        {shown}
      </Animated.Text>
      <AppText variant="headline" tone="secondary" maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {unitLabel}
      </AppText>
    </View>
  );
}
