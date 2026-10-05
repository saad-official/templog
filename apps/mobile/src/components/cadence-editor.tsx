import type { Cadence } from '@templog/shared/schemas';
import { View } from 'react-native';

import { formatHhmm } from '@/constants/format';
import { icons } from '@/constants/icons';
import { spacing } from '@/theme';

import { AppText } from './app-text';
import { Stepper, TimeField } from './form-fields';
import { IconButton } from './icon-button';
import { PrimaryButton } from './primary-button';
import { SegmentedControl } from './segmented-control';

const MODES = [
  { value: 'every', label: 'Every few hours' },
  { value: 'times', label: 'Set times' },
] as const;

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** First free half hour after the latest time, for "Add time". */
function nextTime(times: readonly string[]): string {
  const last = [...times].sort().at(-1) ?? '08:00';
  const [h, m] = last.split(':').map(Number);
  const total = Math.min(23 * 60 + 30, (h ?? 8) * 60 + (m ?? 0) + 120);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  const candidate = `${hh}:${mm}`;
  return times.includes(candidate) ? '12:00' : candidate;
}

/**
 * When a checkpoint is checked: every N hours from opening time while open, or fixed wall-clock
 * times on open days (shared `CadenceSchema`). Checks are derived, so editing never rewrites history.
 */
export function CadenceEditor({ value, onChange }: { value: Cadence; onChange: (cadence: Cadence) => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      <SegmentedControl
        accessibilityLabel="Check schedule"
        options={MODES}
        value={value.kind}
        onChange={(kind) => onChange(kind === 'every' ? { kind: 'every', hours: 4 } : { kind: 'times', times: ['08:00', '14:00'] })}
      />
      {value.kind === 'every' ? (
        <View style={{ gap: spacing.xs }}>
          <Stepper label="Hours between checks" value={value.hours} min={0.5} max={12} step={0.5} format={formatHours} onChange={(hours) => onChange({ kind: 'every', hours })} />
          <AppText variant="caption" tone="secondary">
            {`First check at opening time, then every ${formatHours(value.hours)} until closing.`}
          </AppText>
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          {[...value.times].sort().map((t) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <TimeField
                  label="Check time"
                  value={t}
                  onChange={(next) => {
                    if (next === t || value.times.includes(next)) return;
                    onChange({ kind: 'times', times: value.times.map((x) => (x === t ? next : x)).sort() });
                  }}
                />
              </View>
              <IconButton
                icon={icons.close}
                label={`Remove ${formatHhmm(t)}`}
                disabled={value.times.length <= 1}
                onPress={() => onChange({ kind: 'times', times: value.times.filter((x) => x !== t) })}
              />
            </View>
          ))}
          <PrimaryButton
            title="Add a time"
            icon={icons.add}
            variant="secondary"
            block={false}
            disabled={value.times.length >= 48}
            onPress={() => onChange({ kind: 'times', times: [...value.times, nextTime(value.times)].sort() })}
          />
          <AppText variant="caption" tone="secondary">
            Checks only happen on days the kitchen is open.
          </AppText>
        </View>
      )}
    </View>
  );
}
