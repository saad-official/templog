import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { icons } from '@/constants/icons';
import { useCoolingItems } from '@/hooks/use-cooling-items';
import { useTodayBoard } from '@/hooks/use-today-board';
import { useTheme } from '@/theme';

const ANDROID = process.env.EXPO_OS === 'android';

/** The platform tab bar: Liquid Glass on iOS 26, Material 3 navigation bar on Android. */
export default function TabsLayout() {
  const { colors } = useTheme();
  const board = useTodayBoard();
  const cooling = useCoolingItems();
  const overdue = board?.counts.overdue ?? 0;
  return (
    <NativeTabs
      tintColor={colors.text}
      minimizeBehavior="onScrollDown"
      backgroundColor={ANDROID ? colors.surfaceElevated : undefined}
      indicatorColor={ANDROID ? colors.surfaceSunken : undefined}
      iconColor={ANDROID ? { default: colors.textSecondary, selected: colors.text } : undefined}
      labelStyle={ANDROID ? { default: { color: colors.textSecondary }, selected: { color: colors.text } } : undefined}
      badgeBackgroundColor={colors.heat}
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon sf={icons.today.sf} md={icons.today.md} />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={overdue === 0}>{String(overdue)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="log">
        <NativeTabs.Trigger.Icon sf={icons.log.sf} md={icons.log.md} />
        <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cooling">
        <NativeTabs.Trigger.Icon sf={icons.cooling.sf} md={icons.cooling.md} />
        <NativeTabs.Trigger.Label>Cooling</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={cooling.length === 0}>{String(cooling.length)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf={icons.history.sf} md={icons.history.md} />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={icons.settings.sf} md={icons.settings.md} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
