import { limitsLabel } from '@templog/shared/limits';
import type { Checkpoint } from '@templog/shared/schemas';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { KindIcon } from '@/components/kind-icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { showToast } from '@/components/toast';
import { cadenceSummary } from '@/constants/format';
import { icons } from '@/constants/icons';
import { archiveCheckpoint, reorderCheckpoints } from '@/data';
import { useCheckpoints } from '@/hooks/use-checkpoints';
import { useDisplayUnit } from '@/hooks/use-kitchen';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, spacing, useTheme } from '@/theme';

function edit(id?: string) {
  router.push(id ? { pathname: '/checkpoint-editor', params: { id } } : '/checkpoint-editor');
}

/** Moves a checkpoint one place and saves the whole order in one batch (dense, stable `sortOrder`). */
async function move(list: Checkpoint[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  haptics.selection();
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  try {
    await reorderCheckpoints(next.map((c) => c.id));
  } catch (e) {
    showToast({ message: e instanceof Error ? e.message : "Couldn't reorder." });
  }
}

function CheckpointLine({ checkpoint, subtitle, reorder, index, count, onMove }: { checkpoint: Checkpoint; subtitle: string; reorder: boolean; index: number; count: number; onMove: (delta: -1 | 1) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={reorder}
      onPress={() => edit(checkpoint.id)}
      accessibilityRole="button"
      accessibilityLabel={`${checkpoint.name}, ${subtitle}`}
      accessibilityHint={reorder ? undefined : 'Edits the checkpoint'}
    >
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.surfaceSunken : 'transparent' }}>
          <KindIcon kind={checkpoint.kind} size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="body" weight="600">
              {checkpoint.name}
            </AppText>
            <AppText variant="callout" tone="secondary" tabular>
              {subtitle}
            </AppText>
          </View>
          {reorder ? (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={icons.up} label={`Move ${checkpoint.name} up`} disabled={index === 0} onPress={() => onMove(-1)} />
              <IconButton icon={icons.down} label={`Move ${checkpoint.name} down`} disabled={index === count - 1} onPress={() => onMove(1)} />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** Checkpoints: the live list (reorderable, in the order the Today board breaks ties), add, and archived ones. */
export function CheckpointsScreen() {
  const all = useCheckpoints({ includeArchived: true });
  const unit = useDisplayUnit();
  const [reorder, setReorder] = useState(false);
  const live = all.filter((c) => !c.archivedAt);
  const archived = all.filter((c) => c.archivedAt);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () =>
            live.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => setReorder((r) => !r)} hitSlop={spacing.xs} style={{ paddingHorizontal: spacing.xs, minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="body" weight={reorder ? '700' : '400'} maxFontSizeMultiplier={CHROME_FONT_CAP}>
                  {reorder ? 'Done' : 'Reorder'}
                </AppText>
              </Pressable>
            ) : null,
        }}
      />
      {live.length === 0 ? (
        <EmptyState
          icon={icons.checkpoints}
          title="No checkpoints"
          body="Add each unit you take a temperature of. Limits start at the FDA Food Code defaults."
          action={<PrimaryButton title="Add checkpoint" icon={icons.add} block={false} style={{ alignSelf: 'center' }} onPress={() => edit()} />}
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          <ListGroup inset={spacing.md + 36 + spacing.sm} footer="Editing a schedule never changes past checks: history keeps the checks that were due at the time.">
            {live.map((c, i) => (
              <CheckpointLine
                key={c.id}
                checkpoint={c}
                subtitle={`${limitsLabel(c, unit)} · ${cadenceSummary(c.cadence)}`}
                reorder={reorder}
                index={i}
                count={live.length}
                onMove={(delta) => void move(live, i, delta)}
              />
            ))}
          </ListGroup>
          {reorder ? null : <PrimaryButton title="Add checkpoint" icon={icons.add} variant="secondary" onPress={() => edit()} />}
        </View>
      )}

      {archived.length ? (
        <View style={{ gap: spacing.xs }}>
          <SectionHeader title="Archived" />
          <ListGroup footer="Archived checkpoints have no new checks; their readings stay in history and reports.">
            {archived.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={limitsLabel(c, unit)}
                leading={<KindIcon kind={c.kind} size={32} />}
                trailing={
                  <PrimaryButton
                    title="Restore"
                    icon={icons.unarchive}
                    variant="secondary"
                    block={false}
                    onPress={() =>
                      archiveCheckpoint(c.id, false)
                        .then(() => showToast({ message: `${c.name} restored` }))
                        .catch(() => showToast({ message: "Couldn't restore." }))
                    }
                  />
                }
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
    </Screen>
  );
}
