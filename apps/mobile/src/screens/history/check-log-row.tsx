import { correctiveActionLabel } from '@templog/shared/report';
import type { Checkpoint, Reading } from '@templog/shared/schemas';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { KindIcon } from '@/components/kind-icon';
import { ResultStamp } from '@/components/result-stamp';
import { statusLabel, StatusPill, type PillStatus } from '@/components/status-pill';
import { formatClock } from '@/data';
import { spacing, useTheme } from '@/theme';

export type CheckLogRowProps = {
  checkpoint: Checkpoint;
  /** Scheduled time (null for ad-hoc readings). */
  scheduledFor: string | null;
  state: PillStatus;
  reading: Reading | null;
  /** Earlier readings of the same check (a fail and its re-check). */
  extra?: number;
  unit: Unit;
  tz: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

/**
 * One line of the day timeline: the check time, the checkpoint, and either the reading (value,
 * pass / fail stamp, time taken, initials, corrective action) or the check state (missed shown
 * explicitly, never filled in).
 */
export function CheckLogRow({ checkpoint, scheduledFor, state, reading, extra = 0, unit, tz, onPress, onLongPress }: CheckLogRowProps) {
  const { colors } = useTheme();
  const time = scheduledFor ? formatClock(scheduledFor, tz) : 'Ad hoc';
  const value = reading ? formatTemp(displayTemp(reading.valueF, unit), unit) : null;
  const action = reading ? correctiveActionLabel(reading.correctiveAction) : '';
  const detail = reading
    ? [`Taken ${formatClock(reading.takenAt, tz)}`, reading.initials, extra ? `${extra + 1} readings` : null].filter(Boolean).join(' · ')
    : statusLabel(state);
  const label = reading
    ? `${time}, ${checkpoint.name}: ${value}, ${reading.result}. ${detail}${action ? `. Action: ${action}` : ''}`
    : `${time}, ${checkpoint.name}: ${statusLabel(state)}`;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={label}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
          }}
        >
          <AppText variant="callout" weight="600" tabular style={{ width: 72, color: state === 'missed' ? colors.heatText : colors.text }}>
            {time}
          </AppText>
          <KindIcon kind={checkpoint.kind} size={28} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="body" numberOfLines={1}>
              {checkpoint.name}
            </AppText>
            {reading ? (
              <AppText variant="caption" tone="secondary" tabular>
                {detail}
              </AppText>
            ) : null}
            {action ? (
              <AppText variant="caption" tone="heat">
                {action}
              </AppText>
            ) : null}
          </View>
          {reading ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <AppText variant="body" weight="600" tabular style={{ color: reading.result === 'fail' ? colors.heatText : colors.text }}>
                {value}
              </AppText>
              <ResultStamp result={reading.result} />
            </View>
          ) : (
            <StatusPill status={state} />
          )}
        </View>
      )}
    </Pressable>
  );
}
