// iOS widget via expo-widgets: `NextCheck` (systemSmall/Medium, accessoryCircular/Inline).
import NextCheckWidget, { type NextCheckWidgetProps } from '@/widgets/next-check-widget';

import { deepLinks } from './notifications';
import { buildWidgetSnapshot, buildWidgetTimeline, type WidgetColors, widgetPalette, type WidgetSnapshot } from './widget-snapshot';

export type { WidgetSnapshot } from './widget-snapshot';

const pick = (c: WidgetColors) => ({
  surface: c.surface,
  text: c.text,
  textSecondary: c.textSecondary,
  accent: c.accent,
  accentText: c.accentText,
  pass: c.pass,
  warning: c.warning,
  track: c.track,
});

function toProps(s: WidgetSnapshot): NextCheckWidgetProps {
  const next = s.next;
  const palette = widgetPalette();
  return {
    checkpointName: next?.checkpointName ?? null,
    url: next ? deepLinks.log(next.checkpointId, next.scheduledFor) : deepLinks.today(),
    dueAtMs: next ? Date.parse(next.scheduledFor) : null,
    dueLabel: next?.dueLabel ?? null,
    state: next?.state ?? null,
    compliancePct: s.compliancePct,
    logged: s.logged,
    scheduled: s.scheduled,
    palette: { light: pick(palette.light), dark: pick(palette.dark) },
  };
}

export async function refreshWidgets(snapshot: WidgetSnapshot): Promise<void> {
  try {
    NextCheckWidget.updateSnapshot(toProps(snapshot));
  } catch (error) {
    console.warn('[widgets] updateSnapshot failed', error);
  }
}

/**
 * Current snapshot plus timeline entries at each upcoming check / grace boundary and every 5 minutes
 * for the next two hours, so the widget moves on (and the Lock Screen minutes stay close) while the
 * app is not running.
 */
export async function refreshWidgetsFromDatabase(): Promise<void> {
  try {
    const entries = buildWidgetTimeline().map(({ at, snapshot }) => ({ date: new Date(at), props: toProps(snapshot) }));
    NextCheckWidget.updateTimeline(entries);
  } catch (error) {
    console.warn('[widgets] updateTimeline failed', error);
    await refreshWidgets(buildWidgetSnapshot());
  }
}
