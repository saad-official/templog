import { defaultLimitsFor, limitsLabel } from '@templog/shared/limits';
import { type Cadence, type CheckpointKind, type Limits, LimitsSchema } from '@templog/shared/schemas';
import { displayTemp, toStoredF, type Unit } from '@templog/shared/units';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CadenceEditor } from '@/components/cadence-editor';
import { ChoiceChips, Field, TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { KindIcon } from '@/components/kind-icon';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { KIND_OPTIONS } from '@/constants/checkpoint-presets';
import { icons } from '@/constants/icons';
import { addCheckpoint, archiveCheckpoint, deleteCheckpoint, updateCheckpoint } from '@/data';
import { useCheckpoint, useCheckpoints } from '@/hooks/use-checkpoints';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

const DEFAULT_CADENCE: Cadence = { kind: 'every', hours: 4 };

/** A stored °F bound → the text shown in the field (display unit). */
function boundText(valueF: number | undefined, unit: Unit): string {
  return valueF === undefined ? '' : String(displayTemp(valueF, unit));
}

function parseBound(text: string): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function limitsFrom(minText: string, maxText: string, unit: Unit): { limits: Limits | null; error: string | null } {
  const min = parseBound(minText);
  const max = parseBound(maxText);
  if (min === null || max === null) return { limits: null, error: 'Limits must be numbers.' };
  const candidate: Limits = {
    ...(min !== undefined ? { min: toStoredF(min, unit) } : {}),
    ...(max !== undefined ? { max: toStoredF(max, unit) } : {}),
  };
  const parsed = LimitsSchema.safeParse(candidate);
  if (!parsed.success) return { limits: null, error: parsed.error.issues[0]?.message ?? 'Check the limits.' };
  return { limits: parsed.data, error: null };
}

/**
 * Add or edit a checkpoint (`/checkpoint-editor?id=`): name, kind, limits (prefilled from the Food
 * Code defaults for the kind, in the display unit) and the check schedule.
 */
export function CheckpointEditorSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useCheckpoint(id);
  const all = useCheckpoints({ includeArchived: true });
  const { unit } = useSettings();
  const { colors } = useTheme();
  const editing = !!existing;
  const initialKind: CheckpointKind = existing?.kind ?? 'cold-holding';
  const initialLimits = existing?.limits ?? defaultLimitsFor(initialKind);

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<CheckpointKind>(initialKind);
  const [minText, setMinText] = useState(boundText(initialLimits.min, unit));
  const [maxText, setMaxText] = useState(boundText(initialLimits.max, unit));
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? DEFAULT_CADENCE);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { limits, error: limitsError } = limitsFrom(minText, maxText, unit);
  const defaults = defaultLimitsFor(kind);

  const applyDefaults = (k: CheckpointKind) => {
    const d = defaultLimitsFor(k);
    setMinText(boundText(d.min, unit));
    setMaxText(boundText(d.max, unit));
  };

  const save = async () => {
    if (!name.trim()) {
      setNameError('Name it the way the team says it, like "Walk-in cooler".');
      haptics.warning();
      return;
    }
    if (!limits) {
      haptics.warning();
      return;
    }
    setBusy(true);
    try {
      if (existing) await updateCheckpoint(existing.id, { name: name.trim(), kind, limits, cadence });
      else await addCheckpoint({ name: name.trim(), kind, limits, cadence, sortOrder: all.length });
      haptics.acknowledged();
      router.back();
      showToast({ message: existing ? 'Checkpoint saved' : `${name.trim()} added` });
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't save. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const archive = () => {
    if (!existing) return;
    archiveCheckpoint(existing.id, !existing.archivedAt)
      .then(() => {
        router.back();
        showToast({ message: existing.archivedAt ? `${existing.name} restored` : `${existing.name} archived` });
      })
      .catch(() => showToast({ message: "Couldn't archive. Please try again." }));
  };

  const remove = () => {
    if (!existing) return;
    haptics.warning();
    Alert.alert(`Delete ${existing.name}?`, 'It disappears from Today and Settings. Its readings stay in History and in reports for the days they were taken. Archive instead if you may use it again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteCheckpoint(existing.id)
            .then(() => {
              router.back();
              showToast({ message: `${existing.name} deleted` });
            })
            .catch(() => showToast({ message: "Couldn't delete. Please try again." })),
      },
    ]);
  };

  return (
    <FormSheet title={editing ? 'Edit checkpoint' : 'New checkpoint'} primaryLabel="Save" onPrimary={() => void save()} busy={busy}>
      <TextField
        label="Name"
        placeholder="Walk-in cooler"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError(null);
        }}
        autoFocus={!editing}
        autoCapitalize="words"
        maxLength={80}
        error={nameError}
      />

      <Field label="Kind">
        <ChoiceChips
          accessibilityLabel="Checkpoint kind"
          options={KIND_OPTIONS}
          isSelected={(k) => k === kind}
          onToggle={(k) => {
            setKind(k);
            applyDefaults(k);
          }}
        />
      </Field>

      <Field label={`Limits (°${unit})`} error={limitsError} hint="Leave a side empty for no bound. A reading passes when it is inside the limits.">
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TextField label="At least" placeholder="none" value={minText} onChangeText={setMinText} keyboardType="numbers-and-punctuation" maxLength={6} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="At most" placeholder="none" value={maxText} onChangeText={setMaxText} keyboardType="numbers-and-punctuation" maxLength={6} />
          </View>
        </View>
      </Field>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.sm }}>
        <KindIcon kind={kind} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" weight="600" tabular>
            {limits ? `Pass when ${limitsLabel({ limits }, unit)}` : 'Limits incomplete'}
          </AppText>
          <AppText variant="caption" tone="secondary" tabular>
            {`Food Code default: ${limitsLabel({ limits: defaults }, unit)}`}
          </AppText>
        </View>
        <PrimaryButton title="Reset" variant="ghost" block={false} onPress={() => applyDefaults(kind)} accessibilityLabel="Reset limits to the Food Code default" />
      </View>

      <Field label="Checks">
        <CadenceEditor value={cadence} onChange={setCadence} />
      </Field>

      <PrimaryButton title={editing ? 'Save checkpoint' : 'Add checkpoint'} icon={icons.check} size="lg" loading={busy} onPress={() => void save()} />

      {existing ? (
        <View style={{ gap: spacing.xs }}>
          <PrimaryButton title={existing.archivedAt ? 'Restore checkpoint' : 'Archive checkpoint'} icon={existing.archivedAt ? icons.unarchive : icons.archive} variant="secondary" onPress={archive} />
          <PrimaryButton title="Delete checkpoint" icon={icons.trash} variant="destructive" onPress={remove} />
        </View>
      ) : null}
    </FormSheet>
  );
}
