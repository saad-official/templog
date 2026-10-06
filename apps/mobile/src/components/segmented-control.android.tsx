import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { haptics } from '@/native/haptics';
import { useTheme } from '@/theme';

import type { SegmentedControlProps } from './segmented-control';

/**
 * Android: Material 3 segmented buttons with every state colour taken from the theme. The community
 * wrapper only accepts a tint (which it applies to the selected container alone, leaving labels and
 * outlines on the wallpaper's Material You palette); seeding the host and passing explicit button
 * colours keeps the control on the ink/steel palette in both schemes with a readable selected label.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, style }: SegmentedControlProps<T>) {
  const { colors, scheme } = useTheme();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const buttonColors = {
    activeContainerColor: colors.action,
    activeContentColor: colors.onAction,
    activeBorderColor: colors.border,
    inactiveContentColor: colors.text,
    inactiveBorderColor: colors.border,
  };
  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
      <Host matchContents={{ vertical: true }} seedColor={colors.action} colorScheme={scheme}>
        <SingleChoiceSegmentedButtonRow>
          {options.map((o, i) => (
            <SegmentedButton
              key={o.value}
              selected={i === index}
              colors={buttonColors}
              onClick={() => {
                if (o.value === value) return;
                haptics.selection();
                onChange(o.value);
              }}
            >
              <SegmentedButton.Label>
                <Text>{o.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
