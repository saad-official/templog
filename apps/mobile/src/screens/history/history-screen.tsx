import type { Reading } from '@templog/shared/schemas';
import { displayTemp, formatTemp } from '@templog/shared/units';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListGroup, ListRow } from '@/components/list-row';
import { ResultStamp } from '@/components/result-stamp';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { CountBadge, type PillStatus } from '@/components/status-pill';
import { showToast } from '@/components/toast';
import { formatDayLong, formatPercent, plural } from '@/constants/format';
import { icons } from '@/constants/icons';
import { deleteReading, formatClock, lastKitchenDays, useKitchenToday } from '@/data';
import { useCheckpoints } from '@/hooks/use-checkpoints';
import { useCompliance } from '@/hooks/use-compliance';
import { useDisplayUnit, useKitchen } from '@/hooks/use-kitchen';
import { useDayChecks, useReadings } from '@/hooks/use-readings';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

import { CheckLogRow } from './check-log-row';
import { DayStrip } from './day-strip';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const;

const STRIP_DAYS = 14;

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'heat' | 'pass' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 92, gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular style={{ color: tone === 'heat' ? colors.heatText : tone === 'pass' ? colors.passText : colors.text }}>
        {value}
      </AppText>
    </View>
  );
}

function confirmDelete(reading: Reading, what: string) {
  haptics.warning();
  Alert.alert('Delete this reading?', `${what}. The check it answered becomes open (or missed) again. Use this only for a reading logged by mistake.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete reading',
      style: 'destructive',
      onPress: () =>
        deleteReading(reading)
          .then((r) =>
            showToast({
              message: r.ok ? 'Reading deleted' : r.reason === 'not-undoable' ? "Can't delete: a later cooling reading or the timer's end came after it." : 'That reading was already deleted.',
            }),
          )
          .catch(() => showToast({ message: "Couldn't delete. Please try again." })),
    },
  ]);
}

/**
 * History: the period summary, a day strip, and the chosen day's timeline with every reading and
 * every missed check listed explicitly. Export lives in the header.
 */
export function HistoryScreen() {
  const kitchen = useKitchen();
  const unit = useDisplayUnit();
  const { colors } = useTheme();
  const today = useKitchenToday();
  const [selected, setSelected] = useState(today);
  const [period, setPeriod] = useState<'7' | '30'>('7');
  const summary = useCompliance(lastKitchenDays(Number(period), today));
  const strip = useCompliance(lastKitchenDays(STRIP_DAYS, today));
  const checks = useDayChecks(selected);
  const readings = useReadings({ from: selected, to: selected });
  const checkpoints = useCheckpoints({ includeArchived: true });

  const header = (
    <Stack.Screen options={{ headerRight: () => <IconButton icon={icons.share} label="Export report" onPress={() => router.push('/export')} /> }} />
  );

  if (!kitchen) {
    return (
      <Screen>
        {header}
        <EmptyState icon={icons.history} title="No kitchen yet" body="Set up your kitchen to start a log." />
      </Screen>
    );
  }

  const zone = kitchen.tz;
  const adHoc = readings.filter((r) => !r.scheduledFor);
  const missed = checks.filter((c) => c.state === 'missed').length;
  const stripDays = (strip?.days ?? []).map((d) => ({ dayKey: d.dayKey, rate: d.rate, missed: d.scheduled - d.logged, failed: d.failed }));

  return (
    <Screen>
      {header}

      <View style={{ gap: spacing.sm }}>
        <SegmentedControl accessibilityLabel="Summary period" options={PERIODS} value={period} onChange={setPeriod} />
        {summary ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Stat label="Logged" value={formatPercent(summary.rate)} tone={summary.rate !== null && summary.rate >= 0.95 ? 'pass' : undefined} />
            <Stat label="Checks" value={`${summary.logged}/${summary.scheduled}`} />
            <Stat label="Missed" value={String(summary.missed)} tone={summary.missed ? 'heat' : undefined} />
            <Stat label="Fails" value={String(summary.failed)} tone={summary.failed ? 'heat' : undefined} />
            <Stat label="On time" value={String(summary.onTime)} />
            <Stat label="Streak" value={plural(summary.streak, 'day')} />
          </View>
        ) : null}
      </View>

      <DayStrip days={stripDays} selected={selected} onSelect={setSelected} />

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title={selected === today ? `Today · ${formatDayLong(selected)}` : formatDayLong(selected)} trailing={<CountBadge count={missed} />} />
        {checks.length === 0 && adHoc.length === 0 ? (
          <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.lg }}>
            <AppText variant="body" tone="secondary" align="center">
              No checks were scheduled and nothing was logged on this day.
            </AppText>
          </View>
        ) : (
          <ListGroup inset={spacing.md + 72 + spacing.sm}>
            {checks.map((c) => (
              <CheckLogRow
                key={c.check.id}
                checkpoint={c.checkpoint}
                scheduledFor={c.check.scheduledFor}
                state={c.state as PillStatus}
                reading={c.reading}
                extra={Math.max(0, c.readings.length - 1)}
                unit={unit}
                tz={zone}
                onPress={() => router.push({ pathname: '/history/checkpoint/[id]', params: { id: c.checkpoint.id } })}
                onLongPress={c.reading ? () => confirmDelete(c.reading!, `${c.checkpoint.name} at ${formatClock(c.reading!.takenAt, zone)}`) : undefined}
              />
            ))}
          </ListGroup>
        )}
        {missed ? (
          <AppText variant="caption" tone="heat" style={{ paddingHorizontal: spacing.md }}>
            {`${plural(missed, 'check')} missed. Missed checks stay on the record and in the inspector report.`}
          </AppText>
        ) : null}
      </View>

      {adHoc.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Other readings" />
          <ListGroup>
            {adHoc.map((r) => {
              const name = r.checkpoint?.name ?? (r.coolingItem ? `Cooling: ${r.coolingItem.name}` : 'Reading');
              const value = formatTemp(displayTemp(r.valueF, unit), unit);
              return (
                <ListRow
                  key={r.id}
                  title={`${name} · ${value}`}
                  subtitle={[formatClock(r.takenAt, zone), r.initials].join(' · ')}
                  trailing={<ResultStamp result={r.result} />}
                  onLongPress={r.checkpointId ? () => confirmDelete(r, `${name}, ${value}`) : undefined}
                  accessibilityLabel={`${name}, ${value}, ${r.result}, ${formatClock(r.takenAt, zone)}, ${r.initials}`}
                />
              );
            })}
          </ListGroup>
        </View>
      ) : null}

      {checkpoints.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Checkpoint trends" />
          <ListGroup>
            {checkpoints.map((cp) => (
              <ListRow
                key={cp.id}
                title={cp.name}
                subtitle={cp.archivedAt ? 'Archived' : undefined}
                icon={icons.chart}
                onPress={() => router.push({ pathname: '/history/checkpoint/[id]', params: { id: cp.id } })}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
    </Screen>
  );
}
