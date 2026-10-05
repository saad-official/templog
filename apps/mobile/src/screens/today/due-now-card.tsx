import { formatMinutes } from '@templog/shared/cooling';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { GlassCard } from '@/components/glass-card';
import { Icon } from '@/components/icon';
import { KindIcon } from '@/components/kind-icon';
import { PrimaryButton } from '@/components/primary-button';
import { icons } from '@/constants/icons';
import { formatClock, type TodayBoard } from '@/data';
import { CHROME_FONT_CAP, spacing, useTheme } from '@/theme';

import { openLog, snooze } from './board-actions';

type Next = NonNullable<TodayBoard['next']>;

/**
 * The floating "due now" card (the only glass surface): the next check to act on, when it is due,
 * and the big Log button (one tap to the keypad). Overdue tints heat, due tints amber.
 */
export function DueNowCard({ next, tz, limitsLabel, snoozedUntil }: { next: Next; tz: string; limitsLabel: string; snoozedUntil: string | null }) {
  const { colors } = useTheme();
  const { checkpoint, check, state, minutesUntil } = next;
  const open = state === 'due' || state === 'overdue';
  const time = formatClock(check.scheduledFor, tz);
  const heading = state === 'overdue' ? 'Overdue' : state === 'due' ? 'Due now' : 'Next check';
  const relative =
    state === 'overdue'
      ? `${formatMinutes(minutesUntil)} late`
      : minutesUntil > 0
        ? `in ${formatMinutes(minutesUntil)}`
        : minutesUntil < 0
          ? `${formatMinutes(minutesUntil)} ago`
          : 'now';
  const fg = state === 'overdue' ? colors.heatText : state === 'due' ? colors.warningText : colors.textSecondary;

  return (
    <GlassCard tint={state === 'overdue' ? 'heat' : state === 'due' ? 'warning' : 'none'} padding={spacing.md} gap={spacing.md}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Icon name={state === 'overdue' ? icons.overdue : state === 'due' ? icons.due : icons.upcoming} size={18} color={fg} weight="semibold" />
        <AppText variant="callout" weight="700" style={{ color: fg, flex: 1 }} accessibilityRole="header" maxFontSizeMultiplier={CHROME_FONT_CAP}>
          {`${heading} · ${time}`}
        </AppText>
        <AppText variant="callout" weight="600" tone="secondary" tabular maxFontSizeMultiplier={CHROME_FONT_CAP}>
          {relative}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <KindIcon kind={checkpoint.kind} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="headline" numberOfLines={2}>
            {checkpoint.name}
          </AppText>
          <AppText variant="callout" tone="secondary" tabular>
            {snoozedUntil ? `${limitsLabel} · snoozed until ${formatClock(snoozedUntil, tz)}` : limitsLabel}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <PrimaryButton
          title="Log"
          icon={icons.today}
          size="lg"
          style={{ flex: 1.6 }}
          accessibilityLabel={`Log ${checkpoint.name}`}
          accessibilityHint="Opens the keypad for this check"
          onPress={() => openLog(checkpoint.id, open ? check.scheduledFor : undefined)}
        />
        {open ? (
          <PrimaryButton
            title="Snooze 15"
            icon={icons.snooze}
            size="lg"
            variant="secondary"
            style={{ flex: 1 }}
            accessibilityLabel="Snooze the reminder 15 minutes"
            onPress={() => snooze([check.id])}
          />
        ) : null}
      </View>
    </GlassCard>
  );
}
