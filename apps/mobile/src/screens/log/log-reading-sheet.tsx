import type { Evaluation } from '@templog/shared/limits';
import { limitsLabel } from '@templog/shared/limits';
import type { CorrectiveAction } from '@templog/shared/schemas';
import { convert, displayTemp, formatTemp, type Unit } from '@templog/shared/units';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { correctiveActionFrom, CorrectiveActionPicker, type CorrectiveDraft } from '@/components/corrective-action-picker';
import { EmptyState } from '@/components/empty-state';
import { FormSheet, SheetHeader } from '@/components/form-sheet';
import { Icon } from '@/components/icon';
import { KindIcon } from '@/components/kind-icon';
import { PrimaryButton } from '@/components/primary-button';
import { ReadingEntry } from '@/components/reading-entry';
import { ResultStamp } from '@/components/result-stamp';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { deleteReading, formatClock, logReading, previewReading, suggestedCheckFor } from '@/data';
import { useCheckpoint } from '@/hooks/use-checkpoints';
import { entryFromNumber, useKeypadEntry } from '@/hooks/use-keypad-entry';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, touchTarget, useTheme } from '@/theme';

type Step = 'entry' | 'action';

/** "For the 2:00 PM check" ⇄ "Ad-hoc reading": which scheduled check this reading answers. */
function CheckChip({ time, attached, onToggle }: { time: string | null; attached: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  if (!time) {
    return (
      <AppText variant="caption" tone="secondary">
        Ad-hoc reading (no check due now)
      </AppText>
    );
  }
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: attached }}
      accessibilityLabel={attached ? `Answers the ${time} check` : 'Ad-hoc reading, not tied to a check'}
      accessibilityHint="Switches between the scheduled check and an ad-hoc reading"
      onPress={() => {
        haptics.selection();
        onToggle();
      }}
      hitSlop={spacing.xxs}
      style={({ pressed }) => ({
        minHeight: touchTarget - 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.border : attached ? colors.surfaceSunken : 'transparent',
        borderWidth: attached ? 0 : 1,
        borderColor: colors.border,
      })}
    >
      <Icon name={attached ? icons.clock : icons.add} size={14} color={colors.textSecondary} />
      <AppText variant="caption" weight="700" maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {attached ? `For the ${time} check` : 'Ad-hoc reading'}
      </AppText>
    </Pressable>
  );
}

/**
 * The keypad sheet (`/log/[checkpointId]?scheduledFor=`): type the value, see pass / fail live,
 * Save. A fail opens the mandatory corrective-action step before anything is stored; a save
 * stamps the result, ticks a haptic and offers Undo in a toast.
 */
export function LogReadingSheet() {
  const params = useLocalSearchParams<{ checkpointId: string; scheduledFor?: string }>();
  const checkpointId = params.checkpointId;
  const checkpoint = useCheckpoint(checkpointId);
  const kitchen = useKitchen();
  const settings = useSettings();
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const tz = kitchen?.tz;

  const [unit, setUnit] = useState<Unit>(settings.unit);
  const entry = useKeypadEntry();
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const [suggested] = useState<string | null>(() => params.scheduledFor ?? (checkpointId ? suggestedCheckFor(checkpointId) : null));
  const [attached, setAttached] = useState(true);
  const [step, setStep] = useState<Step>('entry');
  const [draft, setDraft] = useState<CorrectiveDraft>({ kind: null, note: '' });
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState<Evaluation['result'] | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (!checkpoint || checkpoint.deletedAt) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <SheetHeader title="Log a reading" leadingLabel="Close" />
        <EmptyState icon={icons.warning} title="Checkpoint not found" body="It may have been deleted on another phone. Pick another checkpoint from the Log tab." />
      </View>
    );
  }

  const preview = entry.value === null ? null : previewReading(checkpoint.id, entry.value, unit);
  const limit = limitsLabel(checkpoint, unit);
  const valueLabel = entry.value === null ? '' : formatTemp(entry.value, unit);
  const scheduledFor = attached ? suggested : null;
  const checkTime = suggested && tz ? formatClock(suggested, tz) : null;

  const changeUnit = (next: Unit) => {
    if (next === unit) return;
    if (entry.value !== null) entry.setText(entryFromNumber(convert(entry.value, unit, next)));
    setUnit(next);
  };

  const save = async (correctiveAction?: CorrectiveAction) => {
    if (entry.value === null || saving) return;
    if (!initials) {
      haptics.warning();
      showToast({ message: 'Add your initials first: tap "Add initials".' });
      return;
    }
    if (preview?.result === 'fail' && !correctiveAction) {
      haptics.fail();
      setStep('action');
      return;
    }
    setSaving(true);
    try {
      const res = await logReading(checkpoint.id, entry.value, {
        initials,
        unit,
        scheduledFor: scheduledFor ?? (attached ? undefined : null),
        correctiveAction: correctiveAction ?? null,
        source: 'manual',
      });
      if (!res.ok) {
        if (res.reason === 'corrective-action-required') {
          haptics.fail();
          setStep('action');
        } else {
          haptics.warning();
          showToast({ message: 'That checkpoint no longer exists.' });
        }
        return;
      }
      const { reading, evaluation } = res;
      if (evaluation.result === 'pass') haptics.pass();
      else haptics.fail();
      setStep('entry');
      setStamp(evaluation.result);
      const shown = formatTemp(displayTemp(reading.valueF, unit), unit);
      showToast({
        message: `${checkpoint.name}: ${shown} ${evaluation.result === 'pass' ? 'pass' : 'fail logged with action'}`,
        actionLabel: 'Undo',
        onAction: () => {
          deleteReading(reading)
            .then(() => showToast({ message: 'Reading removed' }))
            .catch(() => showToast({ message: "Couldn't undo. Delete it from History." }));
        },
      });
      closeTimer.current = setTimeout(() => router.back(), reduced ? 450 : 850);
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'action' && preview?.result === 'fail') {
    const action = correctiveActionFrom(draft);
    return (
      <FormSheet
        title="Corrective action"
        leadingLabel="Back"
        onLeading={() => setStep('entry')}
      >
        <View style={{ backgroundColor: colors.heatSoft, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ResultStamp result="fail" />
            <AppText variant="headline" tabular style={{ color: colors.heatText }}>
              {valueLabel}
            </AppText>
          </View>
          <AppText variant="body" weight="600" style={{ color: colors.heatText }}>
            {`${checkpoint.name} is ${preview.failReason ?? 'out of range'}.`}
          </AppText>
          <AppText variant="callout" tone="secondary">
            A failed reading is only saved with what you did about it. Inspectors look for this.
          </AppText>
        </View>
        <CorrectiveActionPicker value={draft} onChange={setDraft} />
        <PrimaryButton
          title="Save reading and action"
          icon={icons.fail}
          variant="heat"
          size="lg"
          disabled={!action}
          loading={saving}
          onPress={() => action && void save(action)}
        />
      </FormSheet>
    );
  }

  const fail = preview?.result === 'fail';
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SheetHeader title={checkpoint.name} />
      <ReadingEntry
        context={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <KindIcon kind={checkpoint.kind} size={36} />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="callout" tone="secondary" tabular>
                {`Limit ${limit}`}
              </AppText>
              <CheckChip time={checkTime} attached={attached} onToggle={() => setAttached((a) => !a)} />
            </View>
          </View>
        }
        text={entry.text}
        unit={unit}
        onUnitChange={changeUnit}
        onKey={entry.press}
        result={preview ? preview.result : null}
        resultText={preview ? (preview.result === 'pass' ? `In range (${limit})` : (preview.failReason ?? undefined)) : undefined}
        allowNegative={checkpoint.kind === 'freezer' || checkpoint.kind === 'receiving' || unit === 'C'}
        initials={initials}
        onInitials={setInitials}
        saveLabel={fail ? 'Next: corrective action' : 'Save reading'}
        saveVariant={fail ? 'heat' : 'primary'}
        onSave={() => void save()}
        saving={saving}
        stamp={stamp}
      />
    </View>
  );
}
