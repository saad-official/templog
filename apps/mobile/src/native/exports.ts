// Inspector exports: HTML → PDF (expo-print) and CSV text → a cache file, then the share sheet
// (expo-sharing). The report content comes from shared `report.ts` (`reportModel(range)` in
// `@/data` for the PDF view model, `buildReportCsv(range)` here for the CSV).
import { toCsv } from '@templog/shared/csv';
import { toCsvRows } from '@templog/shared/report';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { buildAllDataExport, fullHistoryRange } from '@/data/export-all';
import { type DayRange, todayKey } from '@/data/time';
import { reportModel } from '@/data/views';

export type ExportResult = { ok: true; uri: string } | { ok: false; reason: 'unavailable' | 'empty' | 'error'; message?: string };

const safeName = (name: string, ext: string) => {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'templog';
  return `${base}.${ext}`;
};

const failure = (error: unknown): ExportResult => ({
  ok: false,
  reason: 'error',
  message: error instanceof Error ? error.message : String(error),
});

function freshCacheFile(name: string): File {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  return file;
}

/**
 * Renders `html` to a US Letter PDF (36 pt margins), names it `filename` and opens the share sheet.
 * `sharePdf(html, 'templog-2026-10-06.pdf')`.
 */
export async function sharePdf(html: string, filename = 'templog-report.pdf'): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
    const { uri } = await Print.printToFileAsync({
      html,
      width: 612,
      height: 792,
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });
    const target = freshCacheFile(safeName(filename, 'pdf'));
    await new File(uri).move(target);
    await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share temperature log' });
    return { ok: true, uri: target.uri };
  } catch (error) {
    return failure(error);
  }
}

/** Opens the system print dialog for `html` (AirPrint / Android print service). */
export async function printHtml(html: string): Promise<ExportResult> {
  try {
    await Print.printAsync({ html });
    return { ok: true, uri: '' };
  } catch (error) {
    return failure(error);
  }
}

/** Writes CSV text to the cache directory and opens the share sheet. `shareCsv(csv, 'templog-week.csv')`. */
export async function shareCsv(csv: string, filename = 'templog-readings.csv'): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
    const file = freshCacheFile(safeName(filename, 'csv'));
    file.create();
    file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export readings' });
    return { ok: true, uri: file.uri };
  } catch (error) {
    return failure(error);
  }
}

/** CSV text (shared `toCsvRows` + `toCsv`, header row included) for a day range of the active kitchen. */
export function buildReportCsv(range: DayRange): { csv: string; rows: number } | null {
  const model = reportModel(range);
  if (!model) return null;
  const rows = toCsvRows(model);
  return { csv: toCsv(rows), rows: rows.length - 1 };
}

/**
 * "Export all data" (Settings): `csv` = every reading and cooling item of the active kitchen as the
 * inspector CSV (shared report rows, first day to today); `json` = everything on this phone (all
 * kitchens, checkpoints, readings, cooling items, settings) as one JSON file. Opens the share sheet.
 */
export async function exportAll(format: 'csv' | 'json' = 'csv'): Promise<ExportResult> {
  const stamp = todayKey();
  if (format === 'json') {
    try {
      if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
      const file = freshCacheFile(`templog-export-${stamp}.json`);
      file.create();
      file.write(JSON.stringify(buildAllDataExport(), null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export all data' });
      return { ok: true, uri: file.uri };
    } catch (error) {
      return failure(error);
    }
  }
  const range = fullHistoryRange();
  if (!range) return { ok: false, reason: 'empty' };
  const built = buildReportCsv(range);
  if (!built) return { ok: false, reason: 'empty' };
  return shareCsv(built.csv, `templog-all-${stamp}.csv`);
}

/** `buildReportCsv` + `shareCsv` with a dated filename. */
export async function shareReportCsv(range: DayRange): Promise<ExportResult> {
  const built = buildReportCsv(range);
  if (!built) return { ok: false, reason: 'empty' };
  const name = range.from === range.to ? `templog-${range.from}` : `templog-${range.from}-to-${range.to}`;
  return shareCsv(built.csv, `${name}.csv`);
}
