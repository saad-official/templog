import { formatMinutes } from '@templog/shared/cooling';
import { correctiveActionLabel } from '@templog/shared/report';
import type { Reading } from '@templog/shared/schemas';
import { displayTemp, formatTemp } from '@templog/shared/units';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressRing } from '@/components/progress-ring';
import { ResultStamp } from '@/components/result-stamp';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { icons } from '@/constants/icons';
import { formatClock } from '@/data';
import { useCoolingItem } from '@/hooks/use-cooling-items';
import { useDisplayUnit, useKitchen } from '@/hooks/use-kitchen';
import { radius, spacing, useTheme } from '@/theme';

import { closedStamp, isOpen, stageLimitLabel } from './cooling-format';

type StageState = 'open' | 'waiting' | 'pass' | 'fail' | 'closed';

function StageRow({ stage, state, limit, due, reading }: { stage: 1 | 2; state: StageState; limit: string; due: string; reading: string | null }) {
  const { colors } = useTheme();
  const tone = state === 'pass' ? colors.passText : state === 'fail' ? colors.heatText : state === 'open' ? colors.heatText : colors.textSecondary;
  const word = { open: 'In progress', waiting: 'Next', pass: 'Passed', fail: 'Missed', closed: 'Stopped' }[state];
  return (
    <View
      accessible
      accessibilityLabel={`Stage ${stage}: ${limit}, due ${due}. ${word}${reading ? `, ${reading}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: state === 'pass' ? colors.passSoft : state === 'fail' || state === 'open' ? colors.heatSoft : colors.surfaceSunken,
        }}
      >
        {state === 'pass' ? (
          <Icon name={icons.check} size={16} color={tone} weight="bold" />
        ) : state === 'fail' ? (
          <Icon name={icons.fail} size={16} color={tone} weight="bold" />
        ) : (
          <AppText variant="callout" weight="700" style={{ color: tone }}>
            {String(stage)}
          </AppText>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" weight="600">{`Stage ${stage}: ${limit}`}</AppText>
        <AppText variant="callout" tone="secondary" tabular>
          {reading ? `${word} · ${reading}` : `${word} · due ${due}`}
        </AppText>
      </View>
    </View>
  );
}

/** One cooling item: the ring and countdown, both stages with their readings, and its actions. */
export function CoolingDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const item = useCoolingItem(itemId);
  const kitchen = useKitchen();
  const unit = useDisplayUnit();
  const { colors } = useTheme();
  const tz = kitchen?.tz;

  if (!item || item.deletedAt) {
    return (
      <Screen>
        <EmptyState icon={icons.cooling} title="Timer not found" body="It may have been removed on another phone." />
      </Screen>
    );
  }

  const open = isOpen(item.status);
  const prompt = item.prompt;
  const overdue = !!prompt && prompt.minutesLeft < 0;
  const stamp = closedStamp(item.status);
  const byId = new Map(item.readings.map((r) => [r.id, r]));
  const show = (r: Reading | undefined) => (r ? `${formatTemp(displayTemp(r.valueF, unit), unit)} at ${formatClock(r.takenAt, tz)}` : null);
  const s1 = item.stage1ReadingId ? byId.get(item.stage1ReadingId) : undefined;
  const s2 = item.stage2ReadingId ? byId.get(item.stage2ReadingId) : undefined;
  const failedStage = item.status === 'failed' ? (item.stage1At ? 2 : 1) : null;
  const stage1: StageState = item.stage1At || item.status === 'done' ? 'pass' : failedStage === 1 ? 'fail' : item.status === 'cooling' ? 'open' : 'closed';
  const stage2: StageState =
    item.status === 'done' ? 'pass' : failedStage === 2 ? 'fail' : item.status === 'stage1-pass' ? 'open' : item.status === 'cooling' ? 'waiting' : 'closed';
  const needsAction = item.status === 'failed' && !item.correctiveAction;

  return (
    <Screen>
      <Stack.Screen options={{ title: item.name }} />
      <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm }}>
        {open && prompt ? (
          <ProgressRing
            progress={item.progress}
            size={200}
            stroke={16}
            color={colors.heat}
            accessibilityLabel={`${item.label}. ${Math.round(item.progress * 100)}% of the stage time used`}
          >
            <AppText variant="display" tabular align="center" adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: overdue ? colors.heatText : colors.text }}>
              {formatMinutes(prompt.minutesLeft)}
            </AppText>
            <AppText variant="callout" tone="secondary" align="center" maxFontSizeMultiplier={1.2}>
              {overdue ? 'overdue' : `left in stage ${prompt.kind === 'stage1' ? 1 : 2}`}
            </AppText>
          </ProgressRing>
        ) : stamp ? (
          <ResultStamp result={stamp.result} label={stamp.label} size="lg" />
        ) : null}
        <AppText variant="body" tone={item.status === 'failed' ? 'heat' : 'secondary'} align="center" selectable>
          {item.label}
        </AppText>
      </View>

      {open ? (
        <View style={{ gap: spacing.xs }}>
          <PrimaryButton
            title="Log reading"
            icon={icons.today}
            size="lg"
            variant="heat"
            onPress={() => router.push({ pathname: '/cooling-log/[itemId]', params: { itemId: item.id } })}
          />
          <PrimaryButton
            title="Discarded"
            icon={icons.trash}
            variant="destructive"
            onPress={() => router.push({ pathname: '/cooling-action/[itemId]', params: { itemId: item.id, mode: 'discard' } })}
            accessibilityHint="Closes the timer: the food was thrown out"
          />
        </View>
      ) : null}

      {needsAction ? (
        <View style={{ backgroundColor: colors.heatSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
          <AppText variant="body" weight="600" tone="heat">
            This item missed a cooling stage. Record what you did with it.
          </AppText>
          <PrimaryButton
            title="Record corrective action"
            icon={icons.fail}
            variant="heat"
            onPress={() => router.push({ pathname: '/cooling-action/[itemId]', params: { itemId: item.id, mode: 'corrective' } })}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Stages" />
        <ListGroup>
          <StageRow stage={1} state={stage1} limit={stageLimitLabel(1, unit)} due={formatClock(item.deadlines.stage1DueAt, tz)} reading={show(s1)} />
          <StageRow stage={2} state={stage2} limit={stageLimitLabel(2, unit)} due={formatClock(item.deadlines.stage2DueAt, tz)} reading={show(s2)} />
        </ListGroup>
      </View>

      {item.readings.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Readings" />
          <ListGroup>
            {item.readings.map((r) => (
              <ListRow
                key={r.id}
                title={formatTemp(displayTemp(r.valueF, unit), unit)}
                subtitle={[formatClock(r.takenAt, tz), r.initials, correctiveActionLabel(r.correctiveAction)].filter(Boolean).join(' · ')}
                trailing={<ResultStamp result={r.result} />}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Record" />
        <ListGroup>
          <ListRow title="Off heat" value={formatClock(item.startedAt, tz)} icon={icons.clock} />
          {item.startValueF != null ? <ListRow title="Start temperature" value={formatTemp(displayTemp(item.startValueF, unit), unit)} icon={icons.today} /> : null}
          {item.initials ? <ListRow title="Started by" value={item.initials} icon={icons.initials} /> : null}
          {item.correctiveAction ? <ListRow title="Corrective action" subtitle={correctiveActionLabel(item.correctiveAction)} icon={icons.fail} /> : null}
          {item.note ? <ListRow title="Note" subtitle={item.note} icon={icons.doc} /> : null}
        </ListGroup>
      </View>
    </Screen>
  );
}
