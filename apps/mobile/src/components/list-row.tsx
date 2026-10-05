import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, View, type AccessibilityRole } from 'react-native';

import { icons, type IconName } from '@/constants/icons';
import { hairline, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText, type TextTone } from './app-text';
import { Icon } from './icon';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Trailing value text (e.g. "°F", "15 min"). */
  value?: string;
  icon?: IconName;
  /** Custom leading element instead of `icon`. */
  leading?: ReactNode;
  /** Custom trailing control (switch, pill) instead of `value` + chevron. */
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Show a disclosure chevron (default: when `onPress` navigates). */
  chevron?: boolean;
  tone?: Extract<TextTone, 'primary' | 'heat'>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
};

/**
 * One row of a grouped list. Rows highlight their background when pressed (never scale) and grow
 * with Dynamic Type; the minimum height is the platform touch target.
 */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  onPress,
  onLongPress,
  chevron,
  tone = 'primary',
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: ListRowProps) {
  const { colors } = useTheme();
  const iconColor = tone === 'heat' ? colors.heatText : colors.textSecondary;
  const showChevron = chevron ?? (!!onPress && !trailing && tone === 'primary');
  const content = (pressed: boolean) => (
    <View
      style={{
        minHeight: touchTarget + spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {leading ?? (icon ? <Icon name={icon} size={22} color={iconColor} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" tone={tone}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="callout" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ??
        (value ? (
          <AppText variant="body" tone="secondary" style={{ flexShrink: 1 }} selectable>
            {value}
          </AppText>
        ) : null)}
      {showChevron ? <Icon name={icons.chevronForward} size={14} color={colors.textTertiary} weight="semibold" directional /> : null}
    </View>
  );

  if (!onPress && !onLongPress) {
    return (
      <View accessible={!trailing} accessibilityLabel={accessibilityLabel}>
        {content(false)}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** Rows of a group; fragments are unwrapped so conditional row sets still get separators. */
function flattenRows(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...flattenRows((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}

/**
 * Inset grouped section: rows on an elevated steel surface separated by hairlines (no per-row
 * cards, no outlines). `footer` explains the group under it.
 */
export function ListGroup({ children, footer, inset = spacing.md }: { children: ReactNode; footer?: string; inset?: number }) {
  const { colors } = useTheme();
  const rows = flattenRows(children);
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={{ height: hairline, backgroundColor: colors.separator, marginStart: inset }} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}
