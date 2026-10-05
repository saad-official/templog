import type { CoolingEvaluation } from '@templog/shared/cooling';
import type { CorrectiveAction } from '@templog/shared/schemas';
import { convert, formatTemp, type Unit } from '@templog/shared/units';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { correctiveActionFrom, CorrectiveActionPicker, type CorrectiveDraft } from '@/components/corrective-action-picker';
import { EmptyState } from '@/components/empty-state';
import { FormSheet, SheetHeader } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressRing } from '@/components/progress-ring';
import { ReadingEntry } from '@/components/reading-entry';
import { ResultStamp, type StampResult } from '@/components/result-stamp';
import { showToast } from '@/components/toast';
import { COOLING_ACTIONS } from '@/constants/checkpoint-presets';
import { icons } from '@/constants/icons';
import { logCoolingReading, previewCoolingReading } from '@/data';
import { useCoolingItem } from '@/hooks/use-cooling-items';
import { entryFromNumber, useKeypadEntry } from '@/hooks/use-keypad-entry';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

import { isOpen, reheatLabel, stageLimitLabel } from './cooling-format';

function stampFor(e: CoolingEvaluation): StampResult {
  return e.outcome === 'pending' ? 'pending' : e.outcome;
}

function previewText(e: CoolingEvaluation): string {
  if (e.outcome === 'fail') return e.failReason ?? 'Stage missed';
  if (e.outcome === 'pending') return 'Not cold enough yet';
  return e.status === 'done' ? 'Fully cooled' : 'Stage 1 met';
}

/**
 * Keypad for a cooling stage reading (`/cooling-log/[itemId]`): live shared `evaluateCooling`
 * preview (pass / keep cooling / fail), and a mandatory corrective action (discard or reheat) when
 * a stage is missed.
 */
export function CoolingReadingSheet() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const item = useCoolingItem(itemId);
  const settings = useSettings();
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const [unit, setUnit] = useState<Unit>(settings.unit);
  const entry = useKeypadEntry();
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const [step, setStep] = useState<'entry' | 'action'>('entry');
  const [draft, setDraft] = useState<CorrectiveDraft>({ kind: null, note: '' });
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState<StampResult | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // While saving / stamping, a stage that just closed the timer must not flash "closed".
  if (!item || item.deletedAt || (!isOpen(item.status) && !stamp && !saving)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <SheetHeader title="Cooling reading" leadingLabel="Close" />
        <EmptyState icon={icons.cooling} title="This timer is closed" body={item ? item.label : 'It may have been removed on another phone.'} />
      </View>
    );
  }

  const preview = entry.value === null ? null : previewCoolingReading(item.id, entry.value, unit);
  const stage = item.prompt?.kind === 'stage2' ? 2 : 1;
  const valueLabel = entry.value === null ? '' : formatTemp(entry.value, unit);

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
    if (preview?.readingResult === 'fail' && !correctiveAction) {
      haptics.fail();
      setStep('action');
      return;
    }
    setSaving(true);
    try {
      const res = await logCoolingReading(item.id, entry.value, initials, { unit, correctiveAction: correctiveAction ?? null, source: 'manual' });
      if (!res.ok) {
        if (res.reason === 'corrective-action-required') {
          haptics.fail();
          setStep('action');
        } else {
          haptics.warning();
          showToast({ message: res.reason === 'closed' ? 'This timer was already closed.' : 'This timer no longer exists.' });
        }
        return;
      }
      const result = stampFor(res.evaluation);
      if (result === 'fail') haptics.fail();
      else if (result === 'pass') haptics.pass();
      else haptics.acknowledged();
      setStep('entry');
      setStamp(result);
      const message =
        res.evaluation.outcome === 'pending'
          ? `${item.name}: logged, keep cooling`
          : res.evaluation.outcome === 'fail'
            ? `${item.name}: stage missed, action recorded`
            : res.item.status === 'done'
              ? `${item.name}: cooled. Timer closed`
              : `${item.name}: stage 1 met. Stage 2 running`;
      showToast({ message });
      closeTimer.current = setTimeout(() => router.back(), reduced ? 450 : 850);
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'action' && preview?.readingResult === 'fail') {
    const action = correctiveActionFrom(draft);
    return (
      <FormSheet title="Corrective action" leadingLabel="Back" onLeading={() => setStep('entry')}>
        <View style={{ backgroundColor: colors.heatSoft, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ResultStamp result="fail" />
            <AppText variant="headline" tabular style={{ color: colors.heatText }}>
              {valueLabel}
            </AppText>
          </View>
          <AppText variant="body" weight="600" style={{ color: colors.heatText }}>
            {`${item.name}: ${preview.failReason ?? 'stage missed'}.`}
          </AppText>
          <AppText variant="callout" tone="secondary">
            {`Reheat to ${reheatLabel(unit)} and start a new timer, or discard it.`}
          </AppText>
        </View>
        <CorrectiveActionPicker value={draft} onChange={setDraft} kinds={COOLING_ACTIONS} />
        <PrimaryButton title="Save reading and action" icon={icons.fail} variant="heat" size="lg" disabled={!action} loading={saving} onPress={() => action && void save(action)} />
      </FormSheet>
    );
  }

  const fail = preview?.readingResult === 'fail';
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SheetHeader title={item.name} />
      <ReadingEntry
        context={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ProgressRing progress={item.progress} size={40} stroke={5} color={colors.heat} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="callout" weight="600" tone="heat">{`Stage ${stage}: ${stageLimitLabel(stage, unit)}`}</AppText>
              <AppText variant="caption" tone="secondary" tabular>
                {item.label}
              </AppText>
            </View>
          </View>
        }
        text={entry.text}
        unit={unit}
        onUnitChange={changeUnit}
        onKey={entry.press}
        result={preview ? stampFor(preview) : null}
        resultText={preview ? previewText(preview) : undefined}
        allowNegative={unit === 'C'}
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
