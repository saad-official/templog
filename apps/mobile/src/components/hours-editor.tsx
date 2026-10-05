import { Host, Switch } from '@expo/ui';
import type { OpeningDay, OpeningHours } from '@templog/shared/schemas';
import { View } from 'react-native';

import { WEEKDAYS, weekdayShort } from '@/constants/format';
import { hairline, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { TimeField } from './form-fields';
import { PrimaryButton } from './primary-button';

const FALLBACK: OpeningDay = { open: '07:00', close: '22:00' };

/** `close <= open` crosses midnight; `open === close` is open around the clock (shared schema). */
export function hoursSummary(day: OpeningDay | null): string {
  if (!day) return 'Closed';
  if (day.open === day.close) return 'Open 24 h';
  return day.close < day.open ? 'Closes after midnight' : '';
}

/**
 * Opening hours per weekday (7 entries, Sunday first; `null` = closed). Checks are only scheduled
 * while the kitchen is open, so these hours drive every reminder.
 */
export function HoursEditor({ value, onChange }: { value: OpeningHours; onChange: (hours: OpeningHours) => void }) {
  const { colors, scheme } = useTheme();
  const set = (day: number, next: OpeningDay | null) => onChange(value.map((d, i) => (i === day ? next : d)) as OpeningHours);
  const firstOpen = value.find((d) => d) ?? FALLBACK;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}>
        {WEEKDAYS.map((day, i) => {
          const hours = value[day] ?? null;
          const note = hoursSummary(hours);
          return (
            <View key={day}>
              {i > 0 ? <View style={{ height: hairline, backgroundColor: colors.separator, marginStart: spacing.md }} /> : null}
              <View style={{ minHeight: touchTarget + spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <AppText variant="body" weight="600" style={{ width: 56 }}>
                    {weekdayShort(day)}
                  </AppText>
                  <View style={{ flex: 1 }}>
                    {hours ? null : (
                      <AppText variant="callout" tone="secondary">
                        Closed
                      </AppText>
                    )}
                  </View>
                  <View
                    accessible
                    accessibilityRole="switch"
                    accessibilityLabel={`Open on ${weekdayShort(day)}`}
                    accessibilityState={{ checked: !!hours }}
                    accessibilityActions={[{ name: 'activate' }]}
                    onAccessibilityAction={() => set(day, hours ? null : { ...firstOpen })}
                  >
                    <Host matchContents colorScheme={scheme} seedColor={colors.pass}>
                      <Switch value={!!hours} onValueChange={(open) => set(day, open ? { ...firstOpen } : null)} />
                    </Host>
                  </View>
                </View>
                {hours ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <TimeField label={`${weekdayShort(day)} opens`} value={hours.open} onChange={(open) => set(day, { ...hours, open })} />
                    <AppText variant="callout" tone="secondary">
                      to
                    </AppText>
                    <TimeField label={`${weekdayShort(day)} closes`} value={hours.close} onChange={(close) => set(day, { ...hours, close })} />
                    {note ? (
                      <AppText variant="caption" tone="secondary">
                        {note}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <PrimaryButton
        title="Use the first open day for every open day"
        variant="ghost"
        block={false}
        onPress={() => onChange(value.map((d) => (d ? { ...firstOpen } : null)) as OpeningHours)}
      />
    </View>
  );
}
