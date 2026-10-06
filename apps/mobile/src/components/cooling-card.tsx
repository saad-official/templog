import { formatMinutes } from '@templog/shared/cooling';
import { Pressable, View } from 'react-native';

import { icons } from '@/constants/icons';
import type { CoolingView } from '@/data';
import { CHROME_FONT_CAP, radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PrimaryButton } from './primary-button';
import { ProgressRing } from './progress-ring';

export type CoolingCardProps = {
  item: CoolingView;
  /** `2:05 PM` the food came off heat. */
  startedLabel: string;
  /** The stage reading is due soon (inside the reminder lead) or overdue: the Log button turns heat. */
  dueSoon: boolean;
  onOpen: () => void;
  onLog: () => void;
};

/**
 * A running cooling timer: a heat ring filling through the open stage, the stage and its limit
 * (shared `coolingLabel`), time left, and the big "Log reading" action.
 */
export function CoolingCard({ item, startedLabel, dueSoon, onOpen, onLog }: CoolingCardProps) {
  const { colors } = useTheme();
  const prompt = item.prompt;
  const overdue = !!prompt && prompt.minutesLeft < 0;
  const stage = prompt?.kind === 'stage2' ? 2 : 1;
  const left = prompt ? formatMinutes(prompt.minutesLeft) : '';
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. Stage ${stage} of 2. ${item.label}. Started ${startedLabel}.`}
      accessibilityHint="Opens the cooling timer"
    >
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceElevated,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            padding: spacing.md,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <ProgressRing progress={item.progress} size={92} stroke={9} color={colors.heat}>
              <AppText variant="headline" tabular align="center" adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: overdue ? colors.heatText : colors.text }}>
                {left}
              </AppText>
              <AppText variant="caption" tone="secondary" align="center" maxFontSizeMultiplier={1.2}>
                {overdue ? 'overdue' : 'left'}
              </AppText>
            </ProgressRing>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="headline" numberOfLines={2}>
                {item.name}
              </AppText>
              <AppText variant="callout" weight="600" tone="heat" maxFontSizeMultiplier={CHROME_FONT_CAP}>
                {`Stage ${stage} of 2`}
              </AppText>
              <AppText variant="callout" tone="secondary" tabular>
                {item.label}
              </AppText>
              <AppText variant="caption" tone="secondary" tabular>
                {item.initials ? `Off heat ${startedLabel} · ${item.initials}` : `Off heat ${startedLabel}`}
              </AppText>
            </View>
          </View>
          <PrimaryButton
            title="Log reading"
            icon={icons.today}
            size="lg"
            variant={dueSoon ? 'heat' : 'secondary'}
            onPress={onLog}
            accessibilityHint={`Logs the stage ${stage} temperature for ${item.name}`}
          />
        </View>
      )}
    </Pressable>
  );
}
