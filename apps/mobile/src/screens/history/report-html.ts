// Inspector report: a print-friendly HTML document built from the shared report view models
// (`reportModel(range)` → shared `rangeReportModel`). expo-print renders it to PDF via `sharePdf`.
// No numbers are computed here: values, limits, labels and totals all come from the model.
import type { CheckpointSection, CoolingSection, DailyReportModel, RangeReportModel, ReportTotals } from '@templog/shared/report';
import { colors as palettes } from '@templog/shared/tokens';

import { formatDayLong, formatDayShort, formatPercent } from '@/constants/format';

const ink = palettes.light;

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resultCell(result: 'pass' | 'fail' | 'missed'): string {
  const label = result === 'pass' ? 'PASS' : result === 'fail' ? 'FAIL' : 'MISSED';
  return `<span class="tag tag-${result}">${label}</span>`;
}

function periodLabel(model: RangeReportModel): string {
  const { from, to } = model.header;
  return from === to ? formatDayLong(from) : `${formatDayShort(from)} – ${formatDayShort(to)}, ${to.slice(0, 4)}`;
}

function totalsBlock(t: ReportTotals): string {
  const cells: [string, string][] = [
    ['Checks logged', `${t.logged} / ${t.scheduled}`],
    ['Compliance', formatPercent(t.rate)],
    ['On time', String(t.onTime)],
    ['Missed checks', String(t.missed)],
    ['Failed readings', String(t.failed)],
    ['Cooling items', t.coolingFailed ? `${t.cooling} (${t.coolingFailed} failed)` : String(t.cooling)],
  ];
  return `<table class="totals"><tr>${cells.map(([k, v]) => `<td><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></td>`).join('')}</tr></table>`;
}

function checkpointTable(s: CheckpointSection): string {
  type Row = { at: string; html: string };
  const rows: Row[] = [
    ...s.rows.map((r) => ({
      at: r.time,
      html: `<tr class="${r.result === 'fail' ? 'row-fail' : ''}">
        <td class="num">${esc(r.time)}</td>
        <td class="num">${esc(r.scheduledTime ?? 'ad hoc')}${r.late ? ' <span class="late">late</span>' : ''}</td>
        <td class="num strong">${esc(r.valueLabel)}</td>
        <td>${resultCell(r.result)}${r.failReason ? `<div class="sub">${esc(r.failReason)}</div>` : ''}</td>
        <td>${esc(r.correctiveAction)}</td>
        <td class="num">${esc(r.initials)}</td>
      </tr>`,
    })),
    ...s.missed.map((m) => ({
      at: m.time,
      html: `<tr class="row-missed">
        <td class="num">—</td>
        <td class="num">${esc(m.time)}</td>
        <td class="num">—</td>
        <td>${resultCell('missed')}</td>
        <td>No reading recorded</td>
        <td></td>
      </tr>`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const body = rows.length ? rows.map((r) => r.html).join('') : '<tr><td colspan="6" class="empty">No checks scheduled.</td></tr>';
  return `<section class="cp">
    <h3>${esc(s.name)} <span class="meta">${esc(s.kindLabel)} · limit ${esc(s.limitsLabel)} · ${s.logged}/${s.scheduled} checks logged</span></h3>
    <table>
      <thead><tr><th>Taken</th><th>Check</th><th>Reading</th><th>Result</th><th>Corrective action</th><th>Initials</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function stageCell(cell: CoolingSection['stage1']): string {
  if (!cell) return '<span class="sub">—</span>';
  return `<div class="num strong">${esc(cell.valueLabel)} ${resultCell(cell.result)}</div><div class="sub">${esc(cell.time)} · ${esc(cell.limitLabel)}</div>`;
}

function coolingTable(items: CoolingSection[]): string {
  if (!items.length) return '';
  return `<section class="cp">
    <h3>Cooling <span class="meta">FDA Food Code 3-501.14, two stages</span></h3>
    <table>
      <thead><tr><th>Item</th><th>Off heat</th><th>Stage 1</th><th>Stage 2</th><th>Status</th><th>Corrective action</th><th>Initials</th></tr></thead>
      <tbody>${items
        .map(
          (c) => `<tr class="${c.status === 'failed' ? 'row-fail' : ''}">
          <td class="strong">${esc(c.name)}</td>
          <td class="num">${esc(c.startedTime)}</td>
          <td>${stageCell(c.stage1)}</td>
          <td>${stageCell(c.stage2)}</td>
          <td>${esc(c.statusLabel)}</td>
          <td>${esc(c.correctiveAction)}</td>
          <td class="num">${esc(c.initials)}</td>
        </tr>`,
        )
        .join('')}</tbody>
    </table>
  </section>`;
}

function dayBlock(day: DailyReportModel, multi: boolean): string {
  const heading = multi
    ? `<h2>${esc(formatDayLong(day.header.from))} <span class="meta">${day.totals.logged}/${day.totals.scheduled} logged · ${day.totals.missed} missed · ${day.totals.failed} failed</span></h2>`
    : '';
  const sections = day.checkpoints.map(checkpointTable).join('') + coolingTable(day.cooling);
  return `<div class="day">${heading}${sections || '<p class="empty">Nothing scheduled or logged.</p>'}</div>`;
}

function correctiveSummary(model: RangeReportModel): string {
  const items: string[] = [];
  for (const day of model.days) {
    for (const s of day.checkpoints) {
      for (const r of s.rows) {
        if (r.result !== 'fail') continue;
        items.push(
          `<tr><td class="num">${esc(formatDayShort(day.header.from))} ${esc(r.time)}</td><td>${esc(s.name)}</td><td class="num strong">${esc(r.valueLabel)}</td><td>${esc(r.failReason)}</td><td>${esc(r.correctiveAction)}</td><td class="num">${esc(r.initials)}</td></tr>`,
        );
      }
    }
    for (const c of day.cooling) {
      if (c.status !== 'failed' && c.status !== 'discarded') continue;
      items.push(
        `<tr><td class="num">${esc(formatDayShort(day.header.from))} ${esc(c.startedTime)}</td><td>Cooling: ${esc(c.name)}</td><td class="num">—</td><td>${esc(c.failReason ?? c.statusLabel)}</td><td>${esc(c.correctiveAction || 'None recorded')}</td><td class="num">${esc(c.initials)}</td></tr>`,
      );
    }
  }
  if (!items.length) return '<section class="cp"><h3>Corrective actions</h3><p class="empty">No failed readings in this period.</p></section>';
  return `<section class="cp">
    <h3>Corrective actions <span class="meta">every failed reading and cooling item</span></h3>
    <table>
      <thead><tr><th>When</th><th>Where</th><th>Reading</th><th>Problem</th><th>Action taken</th><th>Initials</th></tr></thead>
      <tbody>${items.join('')}</tbody>
    </table>
  </section>`;
}

export type ReportHtmlOptions = {
  /** `Oct 6, 2026, 3:12 PM`. */
  generatedAt?: string;
};

/** The full inspector report for a day or a range. */
export function renderReportHtml(model: RangeReportModel, options: ReportHtmlOptions = {}): string {
  const multi = model.days.length > 1;
  const generated = options.generatedAt ?? new Date().toLocaleString();
  const title = `${model.header.kitchenName} · Temperature log · ${periodLabel(model)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: ${ink.text}; font-size: 10.5pt; margin: 0; }
  header { border-bottom: 2px solid ${ink.text}; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 18pt; margin: 0 0 2px; }
  h2 { font-size: 13pt; margin: 18px 0 6px; padding-top: 6px; border-top: 1px solid ${ink.border}; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  .meta { font-weight: 400; color: ${ink.textSecondary}; font-size: 9pt; }
  .head-meta { color: ${ink.textSecondary}; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: ${ink.textSecondary}; border-bottom: 1px solid ${ink.border}; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid ${ink.separator}; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 600; }
  .sub { color: ${ink.textSecondary}; font-size: 8.5pt; }
  .tag { display: inline-block; font-size: 8pt; font-weight: 700; padding: 1px 5px; border-radius: 3px; border: 1px solid; }
  .tag-pass { color: ${ink.passText}; border-color: ${ink.pass}; background: ${ink.passSoft}; }
  .tag-fail { color: ${ink.heatText}; border-color: ${ink.heat}; background: ${ink.heatSoft}; }
  .tag-missed { color: ${ink.heatText}; border-color: ${ink.heatText}; background: ${ink.surfaceElevated}; }
  .row-fail td { background: ${ink.heatSoft}; }
  .row-missed td { color: ${ink.heatText}; }
  .late { color: ${ink.warningText}; font-size: 8pt; font-weight: 700; }
  .empty { color: ${ink.textSecondary}; font-style: italic; }
  .totals td { border: 1px solid ${ink.border}; text-align: center; padding: 6px; }
  .totals .k { font-size: 8pt; color: ${ink.textSecondary}; text-transform: uppercase; letter-spacing: .04em; }
  .totals .v { font-size: 13pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cp { page-break-inside: auto; }
  .sign { margin-top: 28px; display: flex; gap: 32px; }
  .sign div { flex: 1; border-top: 1px solid ${ink.text}; padding-top: 4px; font-size: 9pt; color: ${ink.textSecondary}; }
  footer { margin-top: 16px; font-size: 8pt; color: ${ink.textTertiary}; }
</style>
</head>
<body>
<header>
  <h1>${esc(model.header.kitchenName)}</h1>
  <div class="head-meta">Temperature log · ${esc(periodLabel(model))} · Times in ${esc(model.header.tz)} · Readings in °${esc(model.header.unit)}</div>
</header>
${totalsBlock(model.totals)}
${model.days.map((d) => dayBlock(d, multi)).join('')}
${correctiveSummary(model)}
<div class="sign"><div>Reviewed by (name, signature)</div><div>Date</div></div>
<footer>Generated by Templog on ${esc(generated)}. Missed checks are listed as missed; nothing is filled in after the fact. Limits follow the FDA Food Code defaults set for each checkpoint.</footer>
</body>
</html>`;
}
