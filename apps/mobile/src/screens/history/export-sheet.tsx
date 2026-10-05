import { addDaysToKey } from '@templog/shared/tz';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { formatDayShort, formatPercent } from '@/constants/format';
import { icons } from '@/constants/icons';
import { type DayRange, reportModel, todayKey } from '@/data';
import { useCompliance } from '@/hooks/use-compliance';
import { useKitchen } from '@/hooks/use-kitchen';
import { haptics } from '@/native/haptics';
import { printHtml, shareReportCsv, sharePdf, type ExportResult } from '@/native/exports';
import { radius, spacing, useTheme } from '@/theme';

import { renderReportHtml } from './report-html';

type RangeKey = 'today' | 'yesterday' | 'week' | 'month';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

function rangeFor(key: RangeKey, today: string): DayRange {
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDaysToKey(today, -1);
      return { from: y, to: y };
    }
    case 'week':
      return { from: addDaysToKey(today, -6), to: today };
    case 'month':
      return { from: addDaysToKey(today, -29), to: today };
  }
}

function failureMessage(r: Extract<ExportResult, { ok: false }>): string {
  if (r.reason === 'unavailable') return "Sharing isn't available on this device.";
  if (r.reason === 'empty') return 'Nothing was logged in this period.';
  return r.message ?? "Couldn't export. Please try again.";
}

/** Export: the inspector PDF (share or print) or the CSV for a day, yesterday, a week or a month. */
export function ExportSheet() {
  const kitchen = useKitchen();
  const { colors } = useTheme();
  const tz = kitchen?.tz;
  const today = todayKey(tz);
  const [key, setKey] = useState<RangeKey>('week');
  const range = rangeFor(key, today);
  const summary = useCompliance(range);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'csv' | null>(null);
  const slug = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;

  const run = async (kind: 'pdf' | 'print' | 'csv') => {
    setBusy(kind);
    try {
      let result: ExportResult;
      if (kind === 'csv') {
        result = await shareReportCsv(range);
      } else {
        const model = reportModel(range);
        if (!model) {
          showToast({ message: 'Set up your kitchen first.' });
          return;
        }
        const html = renderReportHtml(model);
        result = kind === 'pdf' ? await sharePdf(html, `templog-${slug}.pdf`) : await printHtml(html);
      }
      if (result.ok) haptics.acknowledged();
      else {
        haptics.warning();
        showToast({ message: failureMessage(result) });
      }
    } catch (e) {
      haptics.warning();
      showToast({ message: e instanceof Error ? e.message : "Couldn't export. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const period = range.from === range.to ? formatDayShort(range.from) : `${formatDayShort(range.from)} – ${formatDayShort(range.to)}`;

  return (
    <FormSheet title="Export">
      <Field label="Period">
        <ChoiceChips accessibilityLabel="Report period" options={RANGES} isSelected={(v) => v === key} onToggle={setKey} />
      </Field>

      <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xxs }}>
        <AppText variant="headline">{kitchen?.name ?? 'Your kitchen'}</AppText>
        <AppText variant="callout" tone="secondary">
          {period}
        </AppText>
        {summary ? (
          <AppText variant="callout" tabular>
            {`${summary.logged}/${summary.scheduled} checks logged (${formatPercent(summary.rate)}) · ${summary.missed} missed · ${summary.failed} failed`}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="secondary">
          The PDF lists every reading with initials, every missed check, cooling stages and each corrective action, with a sign-off line.
        </AppText>
      </View>

      <View style={{ gap: spacing.xs }}>
        <PrimaryButton title="Share PDF" icon={icons.pdf} size="lg" loading={busy === 'pdf'} disabled={!!busy} onPress={() => void run('pdf')} />
        <PrimaryButton title="Print" icon={icons.doc} variant="secondary" loading={busy === 'print'} disabled={!!busy} onPress={() => void run('print')} />
        <PrimaryButton title="Share CSV" icon={icons.csv} variant="secondary" loading={busy === 'csv'} disabled={!!busy} onPress={() => void run('csv')} />
      </View>
    </FormSheet>
  );
}
