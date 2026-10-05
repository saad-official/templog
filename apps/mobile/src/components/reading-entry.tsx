import type { Unit } from '@templog/shared/units';
import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { icons } from '@/constants/icons';
import type { KeypadKey } from '@/hooks/use-keypad-entry';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { IconButton } from './icon-button';
import { InitialsChip } from './initials-chip';
import { Keypad } from './keypad';
import { PrimaryButton, type ButtonVariant } from './primary-button';
import { ReadingDisplay } from './reading-display';
import { ResultStamp, resultWord, type StampResult } from './result-stamp';
import { SegmentedControl } from './segmented-control';

const UNITS = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
] as const;

export type ReadingEntryProps = {
  /** Above the display: kind, limits, the scheduled-check chip. */
  context: ReactNode;
  text: string;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onKey: (key: KeypadKey) => void;
  /** Live preview (`previewReading` / `previewCoolingReading`); null while empty. */
  result: StampResult | null;
  /** `In range`, `above 41 °F`, `Not cold enough yet`. */
  resultText?: string;
  allowNegative?: boolean;
  initials: string;
  onInitials: (initials: string) => void;
  saveLabel: string;
  saveVariant?: ButtonVariant;
  onSave: () => void;
  saving?: boolean;
  /** The stamp that lands once saved. */
  stamp?: StampResult | null;
};

/**
 * The keypad-first entry panel: context, the 48-pt value with a live pass / fail preview, unit
 * toggle, sign, initials, keypad and one big Save. Shared by checkpoint and cooling readings.
 */
export function ReadingEntry({
  context,
  text,
  unit,
  onUnitChange,
  onKey,
  result,
  resultText,
  allowNegative,
  initials,
  onInitials,
  saveLabel,
  saveVariant = 'primary',
  onSave,
  saving,
  stamp,
}: ReadingEntryProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const locked = !!stamp || !!saving;
  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md), gap: spacing.sm }}>
      {context}

      <View
        style={{
          flex: 1,
          minHeight: compact ? 112 : 150,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.md,
          gap: spacing.xs,
        }}
      >
        <ReadingDisplay text={text} unitLabel={`°${unit}`} result={result} resultLabel={result ? [resultWord(result), resultText].filter(Boolean).join(', ') : undefined} />
        <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, opacity: stamp ? 0 : 1 }} importantForAccessibility="no-hide-descendants">
          {result ? (
            <>
              <ResultStamp result={result} />
              {resultText ? (
                <AppText variant="callout" tone="secondary" tabular>
                  {resultText}
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="callout" tone="tertiary">
              Type the temperature
            </AppText>
          )}
        </View>
        {stamp ? (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: spacing.sm, left: 0, right: 0, alignItems: 'center' }}>
            <ResultStamp result={stamp} size="lg" animate />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <SegmentedControl
          accessibilityLabel="Unit for this reading"
          options={UNITS}
          value={unit}
          onChange={onUnitChange}
          style={{ width: 112 }}
        />
        {allowNegative ? <IconButton icon={icons.plusMinus} label="Toggle minus sign" variant="tinted" onPress={() => onKey('sign')} disabled={locked} /> : null}
        <View style={{ flex: 1 }} />
        <InitialsChip value={initials} onChange={onInitials} />
      </View>

      <Keypad onKey={onKey} disabled={locked} compact={compact} />

      <PrimaryButton
        title={saveLabel}
        icon={saveVariant === 'heat' ? icons.fail : icons.check}
        size="lg"
        variant={saveVariant}
        disabled={!text || text === '-' || !!stamp}
        loading={saving}
        onPress={onSave}
      />
    </View>
  );
}
