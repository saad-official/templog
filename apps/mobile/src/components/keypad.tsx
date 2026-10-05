import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { icons } from '@/constants/icons';
import type { KeypadKey } from '@/hooks/use-keypad-entry';
import { haptics } from '@/native/haptics';
import { compactKeyHeight, cssEasing, keyHeight, radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];

const LABELS: Partial<Record<KeypadKey, string>> = { '.': 'Decimal point', back: 'Delete' };

function Key({ k, onKey, disabled, height }: { k: KeypadKey; onKey: (key: KeypadKey) => void; disabled?: boolean; height: number }) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const isBack = k === 'back';
  return (
    <Pressable
      accessibilityRole="keyboardkey"
      accessibilityLabel={LABELS[k] ?? k}
      accessibilityHint={isBack ? 'Double tap and hold to clear' : undefined}
      disabled={disabled}
      onPressIn={() => {
        setPressed(true);
        haptics.key(); // the tick lands with the visual press, not on release
      }}
      onPressOut={() => setPressed(false)}
      onPress={() => onKey(k)}
      onLongPress={isBack ? () => onKey('clear') : undefined}
      delayLongPress={450}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={{
          height,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.keyPressed : isBack ? 'transparent' : colors.key,
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transitionProperty: ['transform', 'backgroundColor'],
          transitionDuration: 100,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        {isBack ? (
          <Icon name={icons.backspace} size={28} color={colors.text} directional />
        ) : (
          <AppText
            variant="title"
            tabular
            maxFontSizeMultiplier={1.3}
            importantForAccessibility="no"
          >
            {k === '.' ? '.' : k}
          </AppText>
        )}
      </Animated.View>
    </Pressable>
  );
}

export type KeypadProps = {
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
  /** Shorter keys for small screens (iPhone SE class); still above the 44 pt minimum. */
  compact?: boolean;
};

/**
 * The reading keypad: big steel caps (64 pt) on a sunken well, a haptic tick per press, decimal
 * point and delete (hold to clear). Digits only: the sign and unit live beside the value display.
 */
export function Keypad({ onKey, disabled, compact }: KeypadProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Number keypad"
      style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.xs, gap: spacing.xs, direction: 'ltr' }}
    >
      {ROWS.map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap: spacing.xs }}>
          {row.map((k) => (
            <Key key={k} k={k} onKey={onKey} disabled={disabled} height={compact ? compactKeyHeight : keyHeight} />
          ))}
        </View>
      ))}
    </View>
  );
}
