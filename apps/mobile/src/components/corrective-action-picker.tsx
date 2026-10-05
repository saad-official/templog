import type { CorrectiveAction, CorrectiveActionKind } from '@templog/shared/schemas';
import { Pressable, View } from 'react-native';

import { CORRECTIVE_ACTIONS } from '@/constants/checkpoint-presets';
import { actionIcons, icons } from '@/constants/icons';
import { haptics } from '@/native/haptics';
import { hairline, radius, spacing, strokeWidth, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { TextField } from './form-fields';
import { Icon } from './icon';

export type CorrectiveDraft = { kind: CorrectiveActionKind | null; note: string };

/** Draft → shared `CorrectiveAction` (null until valid: a kind, and a note for "Other"). */
export function correctiveActionFrom(draft: CorrectiveDraft): CorrectiveAction | null {
  if (!draft.kind) return null;
  const note = draft.note.trim();
  if (draft.kind === 'other' && !note) return null;
  return note ? { kind: draft.kind, note } : { kind: draft.kind };
}

/**
 * The mandatory corrective-action step after a fail: one radio row per action (icon + word), and a
 * note (required for "Other"). Big rows: this is answered with wet hands next to a broken cooler.
 */
export function CorrectiveActionPicker({
  value,
  onChange,
  kinds,
}: {
  value: CorrectiveDraft;
  onChange: (next: CorrectiveDraft) => void;
  /** Allowed kinds (cooling failures: discard / reheat / other). Default: all. */
  kinds?: readonly CorrectiveActionKind[];
}) {
  const { colors } = useTheme();
  const options = CORRECTIVE_ACTIONS.filter((a) => !kinds || kinds.includes(a.kind));
  const needsNote = value.kind === 'other';
  return (
    <View style={{ gap: spacing.md }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Corrective action"
        style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}
      >
        {options.map((o, i) => {
          const selected = value.kind === o.kind;
          return (
            <View key={o.kind}>
              {i > 0 ? <View style={{ height: hairline, backgroundColor: colors.separator, marginStart: spacing.md }} /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${o.label}. ${o.hint}`}
                onPress={() => {
                  haptics.selection();
                  onChange({ ...value, kind: o.kind });
                }}
                style={({ pressed }) => ({
                  minHeight: touchTarget + spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  backgroundColor: selected ? colors.heatSoft : pressed ? colors.surfaceSunken : 'transparent',
                })}
              >
                <Icon name={actionIcons[o.kind]} size={22} color={selected ? colors.heatText : colors.textSecondary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="body" weight="600" style={{ color: selected ? colors.heatText : colors.text }}>
                    {o.label}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {o.hint}
                  </AppText>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: strokeWidth,
                    borderColor: selected ? colors.heat : colors.border,
                    backgroundColor: selected ? colors.heat : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <Icon name={icons.check} size={14} color={colors.onHeat} weight="bold" /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      <TextField
        label={needsNote ? 'What did you do? (required)' : 'Note (optional)'}
        placeholder={needsNote ? 'e.g. Iced the product and re-checked' : 'e.g. Moved to walk-in #2'}
        value={value.note}
        onChangeText={(note) => onChange({ ...value, note })}
        multiline
        maxLength={500}
      />
    </View>
  );
}
