import { Host, Switch } from '@expo/ui';
import { defaultLimitsFor, kindLabel, limitsLabel } from '@templog/shared/limits';
import type { OpeningHours } from '@templog/shared/schemas';
import type { Unit } from '@templog/shared/units';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field, TextField } from '@/components/form-fields';
import { cleanInitials } from '@/components/initials-chip';
import { KindIcon } from '@/components/kind-icon';
import { PrimaryButton } from '@/components/primary-button';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { showToast } from '@/components/toast';
import { HOURS_PRESETS, STARTER_CHECKPOINTS } from '@/constants/checkpoint-presets';
import { WEEKDAYS, weekdayShort } from '@/constants/format';
import { icons } from '@/constants/icons';
import { addCheckpoint, deviceTimeZone, updateKitchen, updateSettings } from '@/data';
import { useCheckpoints } from '@/hooks/use-checkpoints';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { hairline, radius, spacing, textStyles, touchTarget, useTheme } from '@/theme';

const UNITS = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
] as const;

type Starter = { key: string; name: string; kind: (typeof STARTER_CHECKPOINTS)[number]['kind']; on: boolean };

function buildHours(presetKey: string, closed: readonly number[]): OpeningHours {
  const preset = HOURS_PRESETS.find((p) => p.key === presetKey) ?? HOURS_PRESETS[1]!;
  return WEEKDAYS.map((d) => (closed.includes(d) ? null : { open: preset.open, close: preset.close })) as OpeningHours;
}

/** One starter checkpoint: kind glyph, an editable name, its Food Code limit and an include switch. */
function StarterRow({ starter, unit, onChange }: { starter: Starter; unit: Unit; onChange: (next: Starter) => void }) {
  const { colors, scheme } = useTheme();
  const limit = limitsLabel({ limits: defaultLimitsFor(starter.kind) }, unit);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: touchTarget + spacing.sm }}>
      <KindIcon kind={starter.kind} size={36} />
      <View style={{ flex: 1 }}>
        <TextInput
          value={starter.name}
          onChangeText={(name) => onChange({ ...starter, name })}
          accessibilityLabel={`${kindLabel(starter.kind)} checkpoint name`}
          maxLength={80}
          selectionColor={colors.text}
          style={[textStyles.body, { color: starter.on ? colors.text : colors.textTertiary, fontWeight: '600', paddingVertical: spacing.xxs }]}
        />
        <AppText variant="caption" tone="secondary" tabular>
          {`${kindLabel(starter.kind)} · ${limit}`}
        </AppText>
      </View>
      <View
        accessible
        accessibilityRole="switch"
        accessibilityLabel={`Include ${starter.name}`}
        accessibilityState={{ checked: starter.on }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onChange({ ...starter, on: !starter.on })}
      >
        <Host matchContents colorScheme={scheme} seedColor={colors.pass}>
          <Switch value={starter.on} onValueChange={(on) => onChange({ ...starter, on })} />
        </Host>
      </View>
    </View>
  );
}

/**
 * Kitchen setup: name, initials, unit, time zone (from the phone), opening hours quick pick and
 * starter checkpoints with Food Code limits (editable later in Settings).
 */
export function KitchenSetupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kitchen = useKitchen();
  const settings = useSettings();
  const existing = useCheckpoints({ includeArchived: true });
  const [name, setName] = useState(kitchen && kitchen.name !== 'My kitchen' ? kitchen.name : '');
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const [unit, setUnit] = useState<Unit>(kitchen?.unit ?? settings.unit);
  const [preset, setPreset] = useState('all-day');
  const [closed, setClosed] = useState<number[]>([]);
  const [starters, setStarters] = useState<Starter[]>(() => STARTER_CHECKPOINTS.map((s) => ({ ...s, on: true })));
  const [busy, setBusy] = useState(false);
  const tz = deviceTimeZone();
  const hasCheckpoints = existing.length > 0;

  const finish = async () => {
    setBusy(true);
    try {
      await updateKitchen({ name: name.trim() || 'My kitchen', unit, tz, openingHours: buildHours(preset, closed) });
      const clean = cleanInitials(initials);
      if (clean) await updateSettings({ initialsDefault: clean });
      if (!hasCheckpoints) {
        const chosen = starters.filter((s) => s.on && s.name.trim());
        for (const [i, s] of chosen.entries()) await addCheckpoint({ name: s.name.trim(), kind: s.kind, sortOrder: i });
      }
      haptics.pass();
      router.push('/reminders');
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't save the kitchen. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl, paddingHorizontal: spacing.md, gap: spacing.lg }}
      >
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
          <AppText variant="title" accessibilityRole="header">
            Set up your kitchen
          </AppText>
          <AppText variant="body" tone="secondary">
            Two minutes now, and every check, reminder and report follows from it. You can change all of this later.
          </AppText>
        </View>

        <TextField
          label="Kitchen name"
          placeholder="Corner Café"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={80}
          hint="Printed at the top of every inspector report."
        />
        <TextField
          label="Your initials"
          placeholder="SK"
          value={initials}
          onChangeText={(t) => setInitials(cleanInitials(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
          returnKeyType="done"
          hint="Signed on each reading you log. Each person can change theirs on the keypad."
        />

        <Field label="Temperature unit">
          <SegmentedControl accessibilityLabel="Temperature unit" options={UNITS} value={unit} onChange={setUnit} />
        </Field>

        <Field label="Time zone" hint="Checks follow this kitchen's local time, including daylight-saving changes.">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, padding: spacing.sm }}>
            <AppText variant="body" selectable style={{ flex: 1 }}>
              {tz.replace(/_/g, ' ')}
            </AppText>
            <AppText variant="caption" tone="secondary">
              From this phone
            </AppText>
          </View>
        </Field>

        <Field label="Opening hours" hint="Checks and reminders only happen while you're open.">
          <ChoiceChips
            accessibilityLabel="Opening hours"
            options={HOURS_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            isSelected={(v) => v === preset}
            onToggle={setPreset}
          />
        </Field>
        <Field label="Closed on">
          <ChoiceChips
            multi
            accessibilityLabel="Days closed"
            options={WEEKDAYS.map((d) => ({ value: d, label: weekdayShort(d) }))}
            isSelected={(d) => closed.includes(d)}
            onToggle={(d) => setClosed((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))}
          />
        </Field>

        {hasCheckpoints ? null : (
          <View style={{ gap: spacing.xs }}>
            <SectionHeader title="Starter checkpoints" />
            <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}>
              {starters.map((s, i) => (
                <View key={s.key}>
                  {i > 0 ? <View style={{ height: hairline, backgroundColor: colors.separator, marginStart: spacing.md }} /> : null}
                  <StarterRow starter={s} unit={unit} onChange={(next) => setStarters((all) => all.map((x) => (x.key === s.key ? next : x)))} />
                </View>
              ))}
            </View>
            <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
              Limits are FDA Food Code defaults. Rename, add and change them any time in Settings › Checkpoints. Each is checked every 4 hours while open.
            </AppText>
          </View>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface }}>
        <PrimaryButton title="Continue" icon={icons.check} size="lg" loading={busy} onPress={() => void finish()} />
      </View>
    </View>
  );
}
