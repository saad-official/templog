import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { icons, type IconName } from '@/constants/icons';
import { CHROME_FONT_CAP, motion, radius, spacing, springs, strokeWidth, useTheme, type ThemeColors } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export type StampResult = 'pass' | 'fail' | 'pending';

type Meta = { word: string; icon: IconName; fg: keyof ThemeColors; bg: keyof ThemeColors; line: keyof ThemeColors };

const META: Record<StampResult, Meta> = {
  pass: { word: 'Pass', icon: icons.pass, fg: 'passText', bg: 'passSoft', line: 'pass' },
  fail: { word: 'Fail', icon: icons.fail, fg: 'heatText', bg: 'heatSoft', line: 'heat' },
  pending: { word: 'Keep cooling', icon: icons.pending, fg: 'warningText', bg: 'warningSoft', line: 'warning' },
};

export function resultWord(result: StampResult): string {
  return META[result].word;
}

export type ResultStampProps = {
  result: StampResult;
  /** `sm`: inline in rows; `lg`: the stamp that lands after saving. */
  size?: 'sm' | 'lg';
  /** Play the stamp-in (scale down onto the page with a slight tilt). Only for the moment of saving. */
  animate?: boolean;
  label?: string;
};

/**
 * Pass / fail as colour + icon + word (never colour alone). The large stamp lands with a snappy
 * spring (scale 1.35 → 1, tilted), the rare delight moment after a save; with Reduce Motion it
 * just fades in.
 */
export function ResultStamp({ result, size = 'sm', animate = false, label }: ResultStampProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const meta = META[result];
  const progress = useSharedValue(animate ? 0 : 1);
  const fg = colors[meta.fg];

  useEffect(() => {
    if (!animate) return;
    progress.set(reduced ? withTiming(1, { duration: motion.duration.fast }) : withSpring(1, springs.snappy));
  }, [animate, reduced, progress]);

  const stampStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const lift = reduced ? 0 : 1 - p;
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ scale: 1 + lift * 0.35 }, { rotate: size === 'lg' ? '-6deg' : '0deg' }],
    };
  });

  if (size === 'sm') {
    return (
      <View
        accessible
        accessibilityLabel={label ?? meta.word}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xxs,
          paddingHorizontal: spacing.xs,
          paddingVertical: 2,
          borderRadius: radius.sm,
          backgroundColor: colors[meta.bg],
          alignSelf: 'flex-start',
        }}
      >
        <Icon name={meta.icon} size={13} color={fg} weight="bold" />
        <AppText variant="caption" weight="700" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: fg, textTransform: 'uppercase' }}>
          {label ?? meta.word}
        </AppText>
      </View>
    );
  }

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label ?? meta.word}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          borderCurve: 'continuous',
          borderWidth: strokeWidth + 1,
          borderColor: colors[meta.line],
          backgroundColor: colors[meta.bg],
          alignSelf: 'center',
        },
        stampStyle,
      ]}
    >
      <Icon name={meta.icon} size={26} color={fg} weight="bold" />
      <AppText variant="headline" weight="700" maxFontSizeMultiplier={1.3} style={{ color: fg, textTransform: 'uppercase', letterSpacing: 1.5 }}>
        {label ?? meta.word}
      </AppText>
    </Animated.View>
  );
}
