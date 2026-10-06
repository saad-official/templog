import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { icons } from '@/constants/icons';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, strokeWidth, textStyles, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Cleans typed initials: letters only, upper case, 1–4 characters. */
export function cleanInitials(text: string): string {
  return text
    .replace(/[^\p{L}]/gu, '')
    .toUpperCase()
    .slice(0, 4);
}

/**
 * Who is logging: the remembered initials as a chip; tap to change them inline. Empty initials show
 * "Add initials" in warning tones, because a reading cannot be saved without them.
 */
export function InitialsChip({ value, onChange }: { value: string; onChange: (initials: string) => void }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const missing = !value;

  if (editing) {
    const commit = () => {
      const next = cleanInitials(draft);
      setEditing(false);
      if (next) onChange(next);
    };
    return (
      <View
        style={{
          minHeight: touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xxs,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.pill,
          borderWidth: strokeWidth,
          borderColor: colors.text,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <Icon name={icons.initials} size={16} color={colors.textSecondary} />
        <TextInput
          autoFocus
          value={draft}
          onChangeText={(t) => setDraft(cleanInitials(t))}
          onBlur={commit}
          onSubmitEditing={commit}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
          returnKeyType="done"
          placeholder="AB"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Your initials"
          selectionColor={colors.text}
          style={[textStyles.callout, { minWidth: 56, fontWeight: '700', color: colors.text, paddingVertical: spacing.xxs, letterSpacing: 1 }]}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={missing ? 'Add your initials' : `Logged by ${value.split('').join(' ')}`}
      accessibilityHint="Changes who this reading is logged by"
      onPress={() => {
        haptics.selection();
        setDraft(value);
        setEditing(true);
      }}
      hitSlop={spacing.xxs}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: missing ? colors.warningSoft : pressed ? colors.border : colors.fill,
      })}
    >
      <Icon name={icons.initials} size={16} color={missing ? colors.warningText : colors.textSecondary} />
      <AppText variant="callout" weight="700" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: missing ? colors.warningText : colors.text, letterSpacing: 1 }}>
        {missing ? 'Add initials' : value}
      </AppText>
    </Pressable>
  );
}
