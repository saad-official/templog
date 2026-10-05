import type { DayKey } from '@templog/shared/tz';
import { useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { formatDayLong, formatDayNumber, formatPercent, weekdayOfKeyShort } from '@/constants/format';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, useTheme } from '@/theme';

export type StripDay = { dayKey: DayKey; rate: number | null; missed: number; failed: number };

const CELL = 52;

/**
 * Horizontal day picker (oldest → today, opened scrolled to today). Each day shows a compliance
 * mark under its number: green full, amber partial, heat with a count when checks were missed.
 */
export function DayStrip({ days, selected, onSelect }: { days: StripDay[]; selected: DayKey; onSelect: (day: DayKey) => void }) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.xxs }}
      onContentSizeChange={() => {
        // Open on today (the end of the strip), once.
        if (scrolled.current) return;
        scrolled.current = true;
        scrollRef.current?.scrollToEnd({ animated: false });
      }}
    >
      {days.map((d) => {
        const active = d.dayKey === selected;
        const mark = d.rate === null ? colors.track : d.missed > 0 || d.failed > 0 ? colors.heat : d.rate >= 1 ? colors.pass : colors.warning;
        const status = d.rate === null ? 'nothing scheduled' : `${formatPercent(d.rate)} logged${d.missed ? `, ${d.missed} missed` : ''}${d.failed ? `, ${d.failed} failed` : ''}`;
        return (
          <Pressable
            key={d.dayKey}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${formatDayLong(d.dayKey)}, ${status}`}
            onPress={() => {
              if (active) return;
              haptics.selection();
              onSelect(d.dayKey);
            }}
            style={({ pressed }) => ({
              width: CELL,
              paddingVertical: spacing.xs,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              alignItems: 'center',
              gap: spacing.xxs,
              backgroundColor: active ? colors.action : pressed ? colors.surfaceSunken : colors.surfaceElevated,
            })}
          >
            <AppText variant="caption" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: active ? colors.onAction : colors.textSecondary }}>
              {weekdayOfKeyShort(d.dayKey)}
            </AppText>
            <AppText variant="headline" tabular maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: active ? colors.onAction : colors.text }}>
              {formatDayNumber(d.dayKey)}
            </AppText>
            <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: mark }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
