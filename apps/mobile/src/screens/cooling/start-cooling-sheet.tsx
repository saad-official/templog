import { coolingDeadlines } from '@templog/shared/cooling';
import type { Unit } from '@templog/shared/units';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field, TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { InitialsChip } from '@/components/initials-chip';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { formatClock, startCooling } from '@/data';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { spacing } from '@/theme';

import { stageLimitLabel, startLimitLabel } from './cooling-format';

const AGO = [0, 5, 10, 15, 30] as const;

/** Parses a typed temperature (`63`, `63.5`, `63,5`); null when empty or not a number. */
function parseTemp(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "Start cooling": what came off heat, when, and (optionally) how hot it was. */
export function StartCoolingSheet() {
  const settings = useSettings();
  const kitchen = useKitchen();
  const unit: Unit = settings.unit;
  const [name, setName] = useState('');
  const [ago, setAgo] = useState<number>(0);
  const [temp, setTemp] = useState('');
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startValue = parseTemp(temp);
  const tempError = temp.trim() && startValue === null ? 'Type a number, like 140.' : null;

  const start = async () => {
    if (!name.trim()) {
      setError('Name the food, like "Chili, 6 qt".');
      haptics.warning();
      return;
    }
    if (tempError) return;
    setBusy(true);
    try {
      const startedAt = new Date(Date.now() - ago * 60_000).toISOString();
      const item = await startCooling(name.trim(), { initials: initials || null, startValue, unit, startedAt });
      haptics.acknowledged();
      router.back();
      const due = coolingDeadlines(item.startedAt).stage1DueAt;
      showToast({ message: `${item.name}: stage 1 reading due by ${formatClock(due, kitchen?.tz)}` });
    } catch (e) {
      haptics.warning();
      setError(e instanceof Error ? e.message : "Couldn't start the timer. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title="Start cooling" primaryLabel="Start" onPrimary={() => void start()} busy={busy}>
      <TextField
        label="What's cooling?"
        placeholder="Chili, 6 qt"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        maxLength={80}
        error={error}
      />
      <Field label="Came off heat">
        <ChoiceChips
          accessibilityLabel="When the food came off heat"
          options={AGO.map((m) => ({ value: m, label: m === 0 ? 'Just now' : `${m} min ago` }))}
          isSelected={(m) => m === ago}
          onToggle={setAgo}
        />
      </Field>
      <TextField
        label={`Start temperature (°${unit}, optional)`}
        placeholder={startLimitLabel(unit)}
        value={temp}
        onChangeText={setTemp}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        maxLength={6}
        error={tempError}
        hint={`The clock assumes food starts at ${startLimitLabel(unit)} or hotter.`}
      />
      <Field label="Started by">
        <View style={{ flexDirection: 'row' }}>
          <InitialsChip value={initials} onChange={setInitials} />
        </View>
      </Field>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="callout" tone="secondary">{`Stage 1: ${stageLimitLabel(1, unit)}.`}</AppText>
        <AppText variant="callout" tone="secondary">{`Stage 2: ${stageLimitLabel(2, unit)} of coming off heat.`}</AppText>
      </View>
      <PrimaryButton title="Start timer" icon={icons.timerStart} size="lg" variant="heat" loading={busy} onPress={() => void start()} />
    </FormSheet>
  );
}
