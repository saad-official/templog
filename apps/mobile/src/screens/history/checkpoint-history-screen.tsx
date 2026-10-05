import { kindLabel } from '@templog/shared/limits';
import { correctiveActionLabel } from '@templog/shared/report';
import { dayKeyOf } from '@templog/shared/tz';
import { displayTemp, formatTemp } from '@templog/shared/units';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { KindIcon } from '@/components/kind-icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ResultStamp } from '@/components/result-stamp';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { Skeleton } from '@/components/skeleton';
import { Sparkline } from '@/components/sparkline';
import { cadenceSummary, formatDayShort } from '@/constants/format';
import { icons } from '@/constants/icons';
import { formatClock } from '@/data';
import { useCheckpointHistory } from '@/hooks/use-checkpoints';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { radius, spacing, useTheme } from '@/theme';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const;

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'heat' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular adjustsFontSizeToFit numberOfLines={1} style={{ color: tone === 'heat' ? colors.heatText : colors.text }}>
        {value}
      </AppText>
    </View>
  );
}

/** One checkpoint over 7 or 30 days: sparkline against its limits, min / avg / max, fails, recent readings. */
export function CheckpointHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<'7' | '30'>('7');
  const history = useCheckpointHistory(id, Number(period));
  const kitchen = useKitchen();
  const { unit } = useSettings();
  const { colors } = useTheme();
  const tz = kitchen?.tz;

  if (!history) {
    return (
      <Screen>
        <Skeleton height={140} radius="lg" />
        <Skeleton height={64} />
      </Screen>
    );
  }
  const { checkpoint, stats, recent, limitsLabel } = history;
  if (checkpoint.deletedAt) {
    return (
      <Screen>
        <EmptyState icon={icons.checkpoints} title="Checkpoint deleted" body="Its readings remain in reports for the days they were taken." />
      </Screen>
    );
  }
  const t = (f: number | null) => (f === null ? '–' : formatTemp(displayTemp(f, unit), unit));
  const spoken = stats.count
    ? `${stats.count} readings, lowest ${t(stats.min)}, highest ${t(stats.max)}, ${stats.fails} out of range`
    : 'No readings in this period';
  const today = tz ? dayKeyOf(new Date().toISOString(), tz) : null;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: checkpoint.name,
          headerRight: () => (
            <IconButton icon={icons.edit} label="Edit checkpoint" onPress={() => router.push({ pathname: '/checkpoint-editor', params: { id: checkpoint.id } })} />
          ),
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <KindIcon kind={checkpoint.kind} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="headline">{checkpoint.name}</AppText>
          <AppText variant="callout" tone="secondary" tabular>{`${kindLabel(checkpoint.kind)} · limit ${limitsLabel}`}</AppText>
          <AppText variant="caption" tone="secondary">
            {checkpoint.archivedAt ? 'Archived: no new checks' : cadenceSummary(checkpoint.cadence)}
          </AppText>
        </View>
      </View>

      <SegmentedControl accessibilityLabel="Period" options={PERIODS} value={period} onChange={setPeriod} />

      <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.md }}>
        <Sparkline points={stats.points} limits={checkpoint.limits} height={120} accessibilityLabel={`Trend: ${spoken}`} />
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Tile label="Low" value={t(stats.min)} />
          <Tile label="Average" value={t(stats.avg)} />
          <Tile label="High" value={t(stats.max)} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Tile label="Readings" value={String(stats.count)} />
          <Tile label="Out of range" value={String(stats.fails)} tone={stats.fails ? 'heat' : undefined} />
        </View>
        <AppText variant="caption" tone="secondary">
          Dashed line: the limit. Larger heat dots are failed readings.
        </AppText>
      </View>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Recent readings" />
        {recent.length ? (
          <ListGroup>
            {recent.map((r) => {
              const day = tz ? dayKeyOf(r.takenAt, tz) : null;
              const when = `${day && day !== today ? `${formatDayShort(day)}, ` : ''}${formatClock(r.takenAt, tz)}`;
              const action = correctiveActionLabel(r.correctiveAction);
              return (
                <ListRow
                  key={r.id}
                  title={formatTemp(displayTemp(r.valueF, unit), unit)}
                  subtitle={[when, r.initials, action].filter(Boolean).join(' · ')}
                  trailing={<ResultStamp result={r.result} />}
                />
              );
            })}
          </ListGroup>
        ) : (
          <EmptyState icon={icons.today} title="No readings yet" />
        )}
      </View>

      {checkpoint.archivedAt ? null : (
        <PrimaryButton title="Log a reading" icon={icons.today} size="lg" onPress={() => router.push({ pathname: '/log/[checkpointId]', params: { checkpointId: checkpoint.id } })} />
      )}
    </Screen>
  );
}
