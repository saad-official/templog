import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { correctiveActionFrom, CorrectiveActionPicker, type CorrectiveDraft } from '@/components/corrective-action-picker';
import { EmptyState } from '@/components/empty-state';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { COOLING_ACTIONS } from '@/constants/checkpoint-presets';
import { icons } from '@/constants/icons';
import { discardCooling, setCoolingCorrectiveAction } from '@/data';
import { useCoolingItem } from '@/hooks/use-cooling-items';
import { useDisplayUnit } from '@/hooks/use-kitchen';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

import { reheatLabel } from './cooling-format';

/**
 * `/cooling-action/[itemId]?mode=discard|corrective`: close a running timer as "Discarded" (with a
 * note), or record the corrective action for an item that missed a stage by itself.
 */
export function CoolingActionSheet() {
  const { itemId, mode } = useLocalSearchParams<{ itemId: string; mode?: 'discard' | 'corrective' }>();
  const item = useCoolingItem(itemId);
  const unit = useDisplayUnit();
  const { colors } = useTheme();
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<CorrectiveDraft>({ kind: null, note: '' });
  const [busy, setBusy] = useState(false);
  const discard = mode !== 'corrective';

  if (!item) {
    return (
      <FormSheet title="Cooling">
        <EmptyState icon={icons.cooling} title="Timer not found" body="It may have been removed on another phone." />
      </FormSheet>
    );
  }

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      haptics.acknowledged();
      router.back();
      showToast({ message });
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't save. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (discard) {
    return (
      <FormSheet title="Discard" primaryLabel="Discard" onPrimary={() => void run(() => discardCooling(item.id, note), `${item.name} marked discarded`)} busy={busy}>
        <AppText variant="body" tone="secondary">
          {`Closes the timer for ${item.name} and records "Discarded" as the corrective action. The record stays in History and reports.`}
        </AppText>
        <TextField label="Note (optional)" placeholder="e.g. Didn't reach stage 1 in time" value={note} onChangeText={setNote} multiline maxLength={500} />
        <PrimaryButton
          title="Mark discarded"
          icon={icons.trash}
          variant="destructive"
          size="lg"
          loading={busy}
          onPress={() => void run(() => discardCooling(item.id, note), `${item.name} marked discarded`)}
        />
      </FormSheet>
    );
  }

  const action = correctiveActionFrom(draft);
  return (
    <FormSheet title="Corrective action">
      <View style={{ backgroundColor: colors.heatSoft, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs }}>
        <AppText variant="body" weight="600" tone="heat">
          {item.label}
        </AppText>
        <AppText variant="callout" tone="secondary">
          {`Reheat to ${reheatLabel(unit)} and start a new timer, or discard it. Record which.`}
        </AppText>
      </View>
      <CorrectiveActionPicker value={draft} onChange={setDraft} kinds={COOLING_ACTIONS} />
      <PrimaryButton
        title="Save corrective action"
        icon={icons.check}
        variant="heat"
        size="lg"
        disabled={!action}
        loading={busy}
        onPress={() => action && void run(() => setCoolingCorrectiveAction(item.id, action), 'Corrective action recorded')}
      />
    </FormSheet>
  );
}
