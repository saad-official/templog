import type { CheckpointKind, ReadingResult } from '@templog/shared/schemas';
import { View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { KindIcon } from './kind-icon';
import { ResultStamp } from './result-stamp';
import { statusLabel, StatusPill, type PillStatus } from './status-pill';

export type LatestReading = {
  /** `38 °F` (shared `formatTemp(displayTemp(...))`). */
  valueLabel: string;
  result: ReadingResult;
  /** `2:05 PM`. */
  time: string;
  initials?: string;
};

export type CheckpointRowProps = {
  name: string;
  kind: CheckpointKind;
  kindLabel: string;
  /** Shared `limitsLabel`, e.g. `≤ 41 °F`. */
  limitsLabel: string;
  latest: LatestReading | null;
  status: PillStatus;
  /** `2:00 PM`, `in 25 m`. */
  statusDetail?: string;
  pressed?: boolean;
};

/** Spoken summary of a checkpoint row: name, limit, last reading with its result, status. */
export function checkpointRowLabel({ name, kindLabel, limitsLabel, latest, status, statusDetail }: CheckpointRowProps): string {
  const parts = [`${name}, ${kindLabel}, limit ${limitsLabel}`];
  parts.push(latest ? `Last reading ${latest.valueLabel}, ${latest.result}, at ${latest.time}` : 'No readings yet');
  parts.push(statusDetail ? `${statusLabel(status)} ${statusDetail}` : statusLabel(status));
  return parts.join('. ');
}

/**
 * One checkpoint on the Today board: kind glyph, name, limits, the latest reading with its
 * pass / fail stamp and time, and the check status. Visual only: wrap it in a Link / Pressable.
 */
export function CheckpointRow(props: CheckpointRowProps) {
  const { name, kind, limitsLabel, latest, status, statusDetail, pressed } = props;
  const { colors } = useTheme();
  return (
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
      <KindIcon kind={kind} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="body" weight="600" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="callout" tone="secondary" tabular>
          {limitsLabel}
        </AppText>
        <StatusPill status={status} detail={statusDetail} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.xxs, minWidth: 84 }}>
        {latest ? (
          <>
            <AppText variant="headline" tabular style={{ color: latest.result === 'fail' ? colors.heatText : colors.text }}>
              {latest.valueLabel}
            </AppText>
            <ResultStamp result={latest.result} />
            <AppText variant="caption" tone="secondary" tabular>
              {latest.initials ? `${latest.time} · ${latest.initials}` : latest.time}
            </AppText>
          </>
        ) : (
          <AppText variant="callout" tone="tertiary">
            No readings
          </AppText>
        )}
      </View>
    </View>
  );
}
