import type { OpeningHours } from '@templog/shared/schemas';
import type { Unit } from '@templog/shared/units';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Field, Stepper, TextField } from '@/components/form-fields';
import { HoursEditor } from '@/components/hours-editor';
import { cleanInitials } from '@/components/initials-chip';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonList } from '@/components/skeleton';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { deviceTimeZone, updateKitchen, updateSettings } from '@/data';
import { useKitchen } from '@/hooks/use-kitchen';
import { useSettings } from '@/hooks/use-settings';
import { radius, spacing, useTheme } from '@/theme';

const UNITS = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
] as const;

function fail(e: unknown) {
  showToast({ message: e instanceof Error ? e.message : "Couldn't save. Please try again." });
}

/** Kitchen: name, unit, time zone, opening hours and the on-time grace period. Saves as you go. */
export function KitchenSettingsScreen() {
  const kitchen = useKitchen();
  const settings = useSettings();
  const { colors } = useTheme();
  const [name, setName] = useState(kitchen?.name ?? '');
  const [initials, setInitials] = useState(settings.initialsDefault ?? '');
  const phoneTz = deviceTimeZone();

  if (!kitchen) {
    return (
      <Screen>
        <SkeletonList rows={3} />
      </Screen>
    );
  }

  const commitName = () => {
    const next = name.trim();
    if (!next) {
      setName(kitchen.name);
      return;
    }
    if (next !== kitchen.name) updateKitchen({ name: next }).catch(fail);
  };

  return (
    <Screen>
      <TextField label="Kitchen name" value={name} onChangeText={setName} onEndEditing={commitName} onSubmitEditing={commitName} returnKeyType="done" maxLength={80} />
      <Field label="Temperature unit" hint="Readings are stored exactly; this only changes how they're typed and shown.">
        <SegmentedControl accessibilityLabel="Temperature unit" options={UNITS} value={kitchen.unit} onChange={(unit: Unit) => void updateKitchen({ unit }).catch(fail)} />
      </Field>
      <TextField
        label="Your initials on this phone"
        value={initials}
        onChangeText={(t) => setInitials(cleanInitials(t))}
        onEndEditing={() => initials && initials !== settings.initialsDefault && void updateSettings({ initialsDefault: initials }).catch(fail)}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={4}
        returnKeyType="done"
      />

      <Field label="Time zone" hint="Checks, days and reports follow this zone, including daylight-saving changes.">
        <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs }}>
          <AppText variant="body" selectable>
            {kitchen.tz.replace(/_/g, ' ')}
          </AppText>
          {phoneTz !== kitchen.tz ? (
            <PrimaryButton
              title={`Use this phone's zone (${phoneTz.replace(/_/g, ' ')})`}
              icon={icons.globe}
              variant="secondary"
              onPress={() => void updateKitchen({ tz: phoneTz }).catch(fail)}
            />
          ) : null}
        </View>
      </Field>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader title="Opening hours" inset={false} />
        <HoursEditor value={kitchen.openingHours} onChange={(openingHours: OpeningHours) => void updateKitchen({ openingHours }).catch(fail)} />
      </View>

      <Field label="On-time window" hint="A check counts as on time this many minutes either side of its scheduled time, then turns overdue.">
        <Stepper
          label="On-time window"
          value={settings.graceMinutes}
          min={0}
          max={120}
          step={5}
          format={(n) => `± ${n} min`}
          onChange={(graceMinutes) => void updateSettings({ graceMinutes }).catch(fail)}
        />
      </Field>
    </Screen>
  );
}
