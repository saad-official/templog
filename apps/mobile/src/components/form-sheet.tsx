import { router } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { CHROME_FONT_CAP, hairline, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';

/** Height of the sheet header (below the iOS grabber). */
const HEADER_HEIGHT = touchTarget + spacing.md;

function HeaderButton({
  label,
  onPress,
  emphasis,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        minWidth: touchTarget,
        paddingHorizontal: spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <AppText variant="body" weight={emphasis ? '700' : '400'} maxFontSizeMultiplier={CHROME_FONT_CAP}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export type SheetHeaderProps = {
  title: string;
  /** Primary action label ("Save", "Start"). Omit for read-only sheets. */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  /** Leading action; defaults to "Cancel" which dismisses the sheet. */
  leadingLabel?: string;
  onLeading?: () => void;
  /** Content pinned under the header (a step indicator). */
  subheader?: ReactNode;
};

/** Cancel / title / primary row of a sheet. Drag-to-dismiss stays native. */
export function SheetHeader({ title, primaryLabel, onPrimary, primaryDisabled, busy, leadingLabel = 'Cancel', onLeading, subheader }: SheetHeaderProps) {
  const { colors } = useTheme();
  const leading = onLeading ?? (() => router.back());
  return (
    <View style={{ paddingTop: process.env.EXPO_OS === 'ios' ? spacing.xs : spacing.md, backgroundColor: colors.surface }}>
      <View style={{ minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs }}>
        <HeaderButton label={leadingLabel} onPress={leading} />
        <AppText
          variant="body"
          weight="600"
          align="center"
          numberOfLines={1}
          accessibilityRole="header"
          maxFontSizeMultiplier={CHROME_FONT_CAP}
          style={{ flex: 1 }}
        >
          {title}
        </AppText>
        {primaryLabel && onPrimary ? (
          <HeaderButton label={primaryLabel} onPress={onPrimary} emphasis disabled={primaryDisabled} busy={busy} />
        ) : (
          <View style={{ minWidth: touchTarget }} />
        )}
      </View>
      {subheader}
      <View style={{ height: hairline, backgroundColor: colors.separator }} />
    </View>
  );
}

export type FormSheetProps = SheetHeaderProps & {
  children: ReactNode;
  scrollRef?: Ref<ScrollView>;
  /** Pinned under the scrolling form (never under the keyboard: the ScrollView adjusts insets). */
  footer?: ReactNode;
};

/**
 * Content of a `formSheet` route: a header row (Cancel / title / primary action) above a scrolling
 * form. Works on Android too, where form sheets cannot host a native header.
 */
export function FormSheet({ children, scrollRef, footer, ...header }: FormSheetProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SheetHeader {...header} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.xs }}>{footer}</View> : null}
    </View>
  );
}
