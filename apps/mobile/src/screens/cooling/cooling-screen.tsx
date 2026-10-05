import { correctiveActionLabel } from '@templog/shared/report';
import { dayKeyOf } from '@templog/shared/tz';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CoolingCard } from '@/components/cooling-card';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ResultStamp } from '@/components/result-stamp';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { formatDayShort } from '@/constants/format';
import { icons } from '@/constants/icons';
import { formatClock, lastDays } from '@/data';
import { useCoolingHistory, useCoolingItems } from '@/hooks/use-cooling-items';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { spacing } from '@/theme';

import { closedStamp, isOpen, reheatLabel, stageLimitLabel } from './cooling-format';

/** Lead below which a stage reading is "due now" on the card (the reminder lead, at least 15 min). */
const MIN_DUE_LEAD = 15;

/** Cooling: running two-stage timers first, then the last week's finished, failed and discarded items. */
export function CoolingScreen() {
  const kitchen = useKitchen();
  const settings = useSettings();
  const items = useCoolingItems();
  const tz = kitchen?.tz;
  const history = useCoolingHistory(lastDays(7, tz)).filter((i) => !isOpen(i.status));
  const unit = settings.unit;
  const lead = Math.max(MIN_DUE_LEAD, settings.reminderLeadMinutes);

  const start = () => router.push('/start-cooling');
  const header = (
    <Stack.Screen options={{ headerRight: () => <IconButton icon={icons.add} label="Start a cooling timer" onPress={start} /> }} />
  );

  return (
    <Screen>
      {header}
      {items.length === 0 ? (
        <EmptyState
          icon={icons.cooling}
          title="No food cooling"
          body={`Start a timer when cooked food comes off heat. Templog counts stage 1 (${stageLimitLabel(1, unit)}) and stage 2 (${stageLimitLabel(2, unit)}) and prompts for each reading.`}
          action={<PrimaryButton title="Start cooling" icon={icons.timerStart} size="lg" variant="heat" block={false} onPress={start} />}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title={`Cooling now · ${items.length}`} />
          {items.map((item) => (
            <CoolingCard
              key={item.id}
              item={item}
              startedLabel={formatClock(item.startedAt, tz)}
              dueSoon={!!item.prompt && item.prompt.minutesLeft <= lead}
              onOpen={() => router.push({ pathname: '/cooling/[itemId]', params: { itemId: item.id } })}
              onLog={() => router.push({ pathname: '/cooling-log/[itemId]', params: { itemId: item.id } })}
            />
          ))}
          <PrimaryButton title="Start another timer" icon={icons.add} variant="secondary" onPress={start} />
        </View>
      )}

      {history.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Last 7 days" />
          <ListGroup footer={`Failed items need a corrective action on the record: reheat to ${reheatLabel(unit)} and restart, or discard.`}>
            {history.map((item) => {
              const stamp = closedStamp(item.status);
              const needsAction = item.status === 'failed' && !item.correctiveAction;
              const action = correctiveActionLabel(item.correctiveAction);
              const when = `${formatDayShort(dayKeyOf(item.startedAt, tz))} · ${formatClock(item.startedAt, tz)}`;
              return (
                <ListRow
                  key={item.id}
                  title={item.name}
                  subtitle={[when, item.status === 'failed' ? item.failReason : null, action || (needsAction ? 'Needs a corrective action' : null)].filter(Boolean).join(' · ')}
                  trailing={stamp ? <ResultStamp result={stamp.result} label={stamp.label} /> : undefined}
                  tone={needsAction ? 'heat' : 'primary'}
                  onPress={() =>
                    needsAction
                      ? router.push({ pathname: '/cooling-action/[itemId]', params: { itemId: item.id, mode: 'corrective' } })
                      : router.push({ pathname: '/cooling/[itemId]', params: { itemId: item.id } })
                  }
                  accessibilityHint={needsAction ? 'Records the corrective action' : 'Opens the cooling record'}
                />
              );
            })}
          </ListGroup>
        </View>
      ) : null}

      <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
        FDA Food Code 3-501.14: cooked food must cool {stageLimitLabel(1, unit)}, then {stageLimitLabel(2, unit)} of coming off heat.
      </AppText>
    </Screen>
  );
}
