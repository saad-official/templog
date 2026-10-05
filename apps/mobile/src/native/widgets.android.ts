// Android widget via react-native-android-widget (`NextCheck`, 2×2).
import { createElement } from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { type AndroidWidgetColors, NEXT_CHECK_WIDGET_NAME, NextCheckWidgetAndroid } from '@/widgets/next-check-widget.android';

import { deepLinks } from './notifications';
import { buildWidgetSnapshot, type WidgetColors, widgetPalette, type WidgetSnapshot } from './widget-snapshot';

export type { WidgetSnapshot } from './widget-snapshot';

const asColors = (c: WidgetColors) => c as unknown as AndroidWidgetColors;

function subtitle(s: WidgetSnapshot): string {
  const next = s.next;
  if (!next) return '';
  if (next.state === 'overdue') return `${next.dueLabel} · overdue`;
  if (next.state === 'due') return `${next.dueLabel} · due now`;
  const minutes = Math.ceil((Date.parse(next.scheduledFor) - Date.now()) / 60_000);
  return minutes < 60 ? `${next.dueLabel} · in ${Math.max(1, minutes)} min` : next.dueLabel;
}

/** Light + dark renderings; the launcher picks by system theme. */
export function renderNextCheckWidget(s: WidgetSnapshot) {
  const palette = widgetPalette();
  const props = {
    checkpointName: s.next?.checkpointName ?? null,
    subtitle: subtitle(s),
    late: s.next?.state === 'overdue',
    url: s.next ? deepLinks.log(s.next.checkpointId, s.next.scheduledFor) : deepLinks.today(),
    compliancePct: s.compliancePct,
    logged: s.logged,
    scheduled: s.scheduled,
  };
  return {
    light: createElement(NextCheckWidgetAndroid, { ...props, colors: asColors(palette.light) }),
    dark: createElement(NextCheckWidgetAndroid, { ...props, colors: asColors(palette.dark) }),
  };
}

export async function refreshWidgets(snapshot: WidgetSnapshot): Promise<void> {
  try {
    await requestWidgetUpdate({ widgetName: NEXT_CHECK_WIDGET_NAME, renderWidget: () => renderNextCheckWidget(snapshot) });
  } catch (error) {
    console.warn('[widgets] requestWidgetUpdate failed', error);
  }
}

export async function refreshWidgetsFromDatabase(): Promise<void> {
  await refreshWidgets(buildWidgetSnapshot());
}
