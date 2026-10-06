import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ActionSheet } from '@/components/action-sheet';
import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { Skeleton, SkeletonList } from '@/components/skeleton';
import { CountBadge } from '@/components/status-pill';
import { formatDayLong, formatPercent, plural } from '@/constants/format';
import { icons, kindIcons } from '@/constants/icons';
import type { CheckpointBoardItem, TodayBoard } from '@/data';
import { useCoolingItems } from '@/hooks/use-cooling-items';
import { useTodayBoard } from '@/hooks/use-today-board';
import { CHROME_FONT_CAP, radius, spacing, useTheme } from '@/theme';

import { openCheckFor, openHistory, openLog, snooze } from './board-actions';
import { BoardRow } from './board-row';
import { boardRowModel } from './board-row-model';
import { DueNowCard } from './due-now-card';

const RING = 112;

function Summary({ board }: { board: TodayBoard }) {
  const { colors } = useTheme();
  const { compliance, counts, streak } = board;
  const rate = compliance.rate;
  const parts = [
    counts.overdue ? `${counts.overdue} overdue` : null,
    counts.due ? `${counts.due} due` : null,
    `${counts.logged} logged`,
    counts.missed ? `${counts.missed} missed` : null,
  ].filter(Boolean);
  const ringColor = rate === null || rate >= 0.95 ? colors.pass : rate >= 0.75 ? colors.warning : colors.heat;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <ProgressRing
        progress={rate ?? 0}
        size={RING}
        stroke={11}
        color={ringColor}
        accessibilityLabel={rate === null ? 'Compliance today: nothing due yet' : `Compliance today ${formatPercent(rate)}, ${compliance.logged} of ${compliance.scheduled} checks logged`}
      >
        <AppText variant="title" tabular align="center" maxFontSizeMultiplier={1.2} adjustsFontSizeToFit numberOfLines={1}>
          {formatPercent(rate)}
        </AppText>
        <AppText variant="caption" tone="secondary" align="center" maxFontSizeMultiplier={1.2}>
          logged
        </AppText>
      </ProgressRing>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="headline" numberOfLines={2}>
          {board.kitchen.name}
        </AppText>
        <AppText variant="callout" tone="secondary">
          {formatDayLong(board.dayKey)}
        </AppText>
        <AppText variant="callout" tabular style={{ color: counts.overdue ? colors.heatText : colors.text }}>
          {parts.join(' · ')}
        </AppText>
        {streak > 0 ? (
          <View
            accessible
            accessibilityLabel={`${plural(streak, 'day')} fully logged in a row`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start', backgroundColor: colors.passSoft, borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 2 }}
          >
            <Icon name={icons.streak} size={13} color={colors.passText} weight="bold" />
            <AppText variant="caption" weight="700" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: colors.passText }}>
              {`${plural(streak, 'day')} streak`}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TodaySkeleton() {
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Skeleton width={RING} height={RING} radius="pill" />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Skeleton width="70%" height={20} />
          <Skeleton width="50%" height={14} />
          <Skeleton width="60%" height={14} />
        </View>
      </View>
      <Skeleton height={180} radius="lg" />
      <SkeletonList rows={4} />
    </Screen>
  );
}

/** Today: compliance so far, the glass "due now" card, every checkpoint by urgency, running cooling timers. */
export function TodayScreen() {
  const board = useTodayBoard();
  const cooling = useCoolingItems();
  const { colors } = useTheme();
  const [menuFor, setMenuFor] = useState<CheckpointBoardItem | null>(null);

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => <IconButton icon={icons.timerStart} label="Start a cooling timer" onPress={() => router.push('/start-cooling')} />,
      }}
    />
  );

  if (!board) return <TodaySkeleton />;
  const { kitchen, unit, items, next } = board;
  const tz = kitchen.tz;

  if (items.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={icons.today}
          title="Add your first checkpoint"
          body="A checkpoint is anything you take a temperature of: the walk-in, a reach-in, the hot well. Templog schedules its checks and reminds the line."
          action={<PrimaryButton title="Add checkpoint" icon={icons.add} size="lg" block={false} style={{ alignSelf: 'center' }} onPress={() => router.push('/checkpoint-editor')} />}
        />
      </Screen>
    );
  }

  const nextItem = next ? items.find((i) => i.checkpoint.id === next.checkpoint.id) : undefined;
  const menuOpen = menuFor?.current && (menuFor.current.state === 'due' || menuFor.current.state === 'overdue') ? menuFor.current : null;

  return (
    <Screen>
      {header}
      <Summary board={board} />

      {next ? (
        <DueNowCard
          next={next}
          tz={tz}
          limitsLabel={nextItem?.limitsLabel ?? ''}
        />
      ) : (
        <View style={{ backgroundColor: colors.passSoft, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name={icons.pass} size={24} color={colors.passText} />
          <AppText variant="body" weight="600" style={{ color: colors.passText, flex: 1 }}>
            No more checks today. Nice work.
          </AppText>
        </View>
      )}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Checkpoints" trailing={<CountBadge count={board.counts.overdue} />} />
        <ListGroup inset={spacing.md + 40 + spacing.sm}>
          {items.map((item) => (
            <BoardRow key={item.checkpoint.id} item={item} row={boardRowModel(item, unit, tz, board.dayKey)} onLongPress={setMenuFor} />
          ))}
        </ListGroup>
      </View>

      {cooling.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Cooling now" />
          <ListGroup>
            {cooling.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.label}
                leading={<ProgressRing progress={c.progress} size={36} stroke={5} color={colors.heat} accessibilityLabel={`${Math.round(c.progress * 100)}% of the stage used`} />}
                onPress={() => router.push({ pathname: '/cooling/[itemId]', params: { itemId: c.id } })}
                accessibilityHint="Opens the cooling timer"
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      {process.env.EXPO_OS === 'ios' ? null : (
        <ActionSheet
          visible={!!menuFor}
          onClose={() => setMenuFor(null)}
          title={menuFor?.checkpoint.name}
          actions={
            menuFor
              ? [
                  { key: 'log', label: 'Log a reading', icon: kindIcons[menuFor.checkpoint.kind], onPress: () => openLog(menuFor.checkpoint.id, openCheckFor(menuFor)) },
                  ...(menuOpen ? [{ key: 'snooze', label: 'Snooze 15 minutes', icon: icons.snooze, onPress: () => snooze([menuOpen.check.id]) }] : []),
                  { key: 'history', label: 'History', icon: icons.history, onPress: () => openHistory(menuFor.checkpoint.id) },
                ]
              : []
          }
        />
      )}
    </Screen>
  );
}
