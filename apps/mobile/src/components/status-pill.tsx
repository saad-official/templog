import { View } from 'react-native';

import { icons, type IconName } from '@/constants/icons';
import { CHROME_FONT_CAP, radius, spacing, useTheme, type ThemeColors } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Board statuses (`useTodayBoard`) plus check states (`useDayChecks`). */
export type PillStatus = 'overdue' | 'due' | 'missed' | 'upcoming' | 'done' | 'logged' | 'none' | 'snoozed';

type Meta = { label: string; fg: keyof ThemeColors; bg: keyof ThemeColors; icon: IconName };

const META: Record<PillStatus, Meta> = {
  overdue: { label: 'Overdue', fg: 'onHeat', bg: 'heat', icon: icons.overdue },
  due: { label: 'Due now', fg: 'onWarning', bg: 'warning', icon: icons.due },
  missed: { label: 'Missed', fg: 'heatText', bg: 'heatSoft', icon: icons.missed },
  upcoming: { label: 'Upcoming', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.upcoming },
  done: { label: 'Done', fg: 'passText', bg: 'passSoft', icon: icons.pass },
  logged: { label: 'Logged', fg: 'passText', bg: 'passSoft', icon: icons.pass },
  none: { label: 'No checks today', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.clock },
  snoozed: { label: 'Snoozed', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.snooze },
};

export function statusLabel(status: PillStatus): string {
  return META[status].label;
}

/**
 * A status capsule. Colour is never the only signal: every status has an icon and a word, and an
 * optional detail (`2:00 PM`, `in 25 m`).
 */
export function StatusPill({ status, detail }: { status: PillStatus; detail?: string }) {
  const { colors } = useTheme();
  const meta = META[status];
  const fg = colors[meta.fg];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.xs,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors[meta.bg],
        alignSelf: 'flex-start',
      }}
    >
      <Icon name={meta.icon} size={12} color={fg} weight="bold" />
      <AppText variant="caption" weight="700" tabular maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: fg }}>
        {detail ? `${meta.label} · ${detail}` : meta.label}
      </AppText>
    </View>
  );
}

/** A small count badge (overdue count beside a section title). */
export function CountBadge({ count, tone = 'heat' }: { count: number; tone?: 'heat' | 'neutral' }) {
  const { colors } = useTheme();
  if (count <= 0) return null;
  return (
    <View
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'heat' ? colors.heat : colors.surfaceSunken,
      }}
    >
      <AppText variant="caption" weight="700" tabular maxFontSizeMultiplier={1.2} style={{ color: tone === 'heat' ? colors.onHeat : colors.text }}>
        {count > 99 ? '99+' : String(count)}
      </AppText>
    </View>
  );
}
