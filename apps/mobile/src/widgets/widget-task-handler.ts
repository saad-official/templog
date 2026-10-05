// Android widget task handler (headless JS). Runs when a widget is added, resized, updated by the
// system (every 30 min) or tapped, possibly with the app process cold, so it reads SQLite directly.
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { ensureKitchen } from '@/data/kitchen-repo';
import { ensureDatabaseReady } from '@/data/migrate';
import { buildWidgetSnapshot } from '@/native/widget-snapshot';
import { renderNextCheckWidget } from '@/native/widgets.android';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, renderWidget } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  try {
    await ensureDatabaseReady();
    ensureKitchen();
    renderWidget(renderNextCheckWidget(buildWidgetSnapshot()));
  } catch (error) {
    console.warn('[widgets] task handler failed', error);
  }
}
