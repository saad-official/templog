import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SkeletonList } from '@/components/skeleton';
import { icons } from '@/constants/icons';
import { useCoolingItems } from '@/hooks/use-cooling-items';
import { useTodayBoard } from '@/hooks/use-today-board';
import { BoardRow } from '@/screens/today/board-row';
import { boardRowModel } from '@/screens/today/board-row-model';
import { spacing, useTheme } from '@/theme';

/**
 * The Log tab: pick what you are measuring (most urgent first), then the keypad sheet opens. Cooling
 * timers and starting a new one sit below.
 */
export function LogPickerScreen() {
  const board = useTodayBoard();
  const cooling = useCoolingItems();
  const { colors } = useTheme();

  if (!board) {
    return (
      <Screen>
        <SkeletonList rows={5} />
      </Screen>
    );
  }

  const { items, unit, kitchen, dayKey } = board;
  return (
    <Screen>
      {items.length === 0 ? (
        <EmptyState
          icon={icons.checkpoints}
          title="Nothing to log yet"
          body="Add a checkpoint (a cooler, a hot well, a freezer) and it shows up here."
          action={<PrimaryButton title="Add checkpoint" icon={icons.add} block={false} onPress={() => router.push('/checkpoint-editor')} />}
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Checkpoints" />
          <ListGroup inset={spacing.md + 40 + spacing.sm} footer="Tap a checkpoint, type the temperature, Save.">
            {items.map((item) => (
              <BoardRow key={item.checkpoint.id} item={item} row={boardRowModel(item, unit, kitchen.tz, dayKey)} />
            ))}
          </ListGroup>
        </View>
      )}

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Cooling" />
        <ListGroup>
          {cooling.map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={c.label}
              leading={<ProgressRing progress={c.progress} size={36} stroke={5} color={colors.heat} />}
              onPress={() => router.push({ pathname: '/cooling-log/[itemId]', params: { itemId: c.id } })}
              accessibilityHint="Opens the keypad for this cooling stage"
            />
          ))}
          <ListRow title="Start a cooling timer" icon={icons.timerStart} onPress={() => router.push('/start-cooling')} accessibilityHint="Food just came off heat" />
        </ListGroup>
      </View>
    </Screen>
  );
}
