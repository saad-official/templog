import { useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { IconName } from '@/constants/icons';
import { cssEasing, radius, touchTarget, useTheme } from '@/theme';

import { Icon } from './icon';

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only controls must name themselves. */
  label: string;
  onPress?: () => void;
  variant?: 'plain' | 'tinted' | 'filled';
  size?: number;
  disabled?: boolean;
  directional?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Round icon control with a 44/48 pt target and a small press scale. */
export function IconButton({ icon, label, onPress, variant = 'plain', size = touchTarget, disabled, directional, style }: IconButtonProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const bg = variant === 'filled' ? colors.action : variant === 'tinted' ? colors.fill : 'transparent';
  const fg = variant === 'filled' ? colors.onAction : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={Math.max(0, (touchTarget - size) / 2)}
      style={style}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        <Icon name={icon} size={Math.round(size * 0.46)} color={fg} weight="semibold" directional={directional} />
      </Animated.View>
    </Pressable>
  );
}
