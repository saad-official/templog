import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { formatHhmm, hhmmToDate, toHhmm } from '@/constants/format';
import { icons } from '@/constants/icons';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, strokeWidth, textStyles, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';
import { IconButton } from './icon-button';

/** Label + control + optional hint / error, the building block of every form. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="callout" weight="600" tone="secondary">
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" tone="heat" accessibilityLiveRegion="polite" selectable>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<TextInput>;
};

/** A labelled text input on a sunken well. Grows with Dynamic Type. */
export function TextField({ label, hint, error, style, multiline, ref, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <Field label={label} hint={hint} error={error}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.text}
        cursorColor={colors.text}
        multiline={multiline}
        style={[
          textStyles.body,
          {
            color: colors.text,
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.sm,
            borderCurve: 'continuous',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            minHeight: multiline ? 96 : touchTarget + spacing.xs,
            textAlignVertical: multiline ? 'top' : 'center',
            borderWidth: error ? strokeWidth : 0,
            borderColor: colors.heat,
          },
          style,
        ]}
        {...props}
      />
    </Field>
  );
}

/** − value + with large targets; VoiceOver / TalkBack treat it as one adjustable control. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format = (n: number) => String(n),
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    if (clamped === value) return;
    haptics.selection();
    onChange(clamped);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + step : value - step)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.pill,
        padding: spacing.xxs,
        alignSelf: 'flex-start',
      }}
    >
      <IconButton icon={{ sf: 'minus', md: 'remove' }} label={`Decrease ${label}`} disabled={value <= min} onPress={() => set(value - step)} />
      <AppText variant="headline" tabular maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ minWidth: 88, textAlign: 'center' }}>
        {format(value)}
      </AppText>
      <IconButton icon={icons.add} label={`Increase ${label}`} disabled={value >= max} onPress={() => set(value + step)} />
    </View>
  );
}

/** Single- or multi-select chips that wrap (kind, presets, weekdays, corrective actions). */
export function ChoiceChips<T extends string | number>({
  options,
  isSelected,
  onToggle,
  accessibilityLabel,
  multi,
}: {
  options: readonly { value: T; label: string }[];
  isSelected: (value: T) => boolean;
  onToggle: (value: T) => void;
  accessibilityLabel: string;
  multi?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
      {options.map((o) => {
        const selected = isSelected(o.value);
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: selected } : { selected }}
            accessibilityLabel={o.label}
            onPress={() => {
              haptics.selection();
              onToggle(o.value);
            }}
            style={({ pressed }) => ({
              minHeight: touchTarget,
              minWidth: touchTarget,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: spacing.xxs,
              backgroundColor: selected ? colors.action : pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            {selected && multi ? <Icon name={icons.check} size={14} color={colors.onAction} weight="bold" /> : null}
            <AppText variant="callout" weight="600" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: selected ? colors.onAction : colors.text }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A wall-clock time (`HH:mm`). iOS: the native compact picker inline. Android: a chip that opens the
 * Material time dialog (mounted only while open, per the dialog contract).
 */
export function TimeField({ value, onChange, label }: { value: string; onChange: (hhmm: string) => void; label: string }) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (process.env.EXPO_OS === 'ios') {
    return (
      <View accessibilityLabel={`${label}, ${formatHhmm(value)}`}>
        <DateTimePicker
          value={hhmmToDate(value)}
          mode="time"
          display="compact"
          accentColor={colors.text}
          themeVariant={scheme}
          onValueChange={(_, date) => onChange(toHhmm(date))}
        />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatHhmm(value)}`}
        accessibilityHint="Opens the time picker"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: touchTarget,
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: pressed ? colors.border : colors.surfaceSunken,
        })}
      >
        <Icon name={icons.clock} size={18} color={colors.textSecondary} />
        <AppText variant="body" weight="600" tabular>
          {formatHhmm(value)}
        </AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={hhmmToDate(value)}
          mode="time"
          presentation="dialog"
          accentColor={colors.text}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(toHhmm(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
