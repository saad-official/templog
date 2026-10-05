// "Export all data" (privacy page promise): everything this phone holds, as plain JSON, plus the
// full-history day range for the CSV / PDF report of the active kitchen.
import type { Checkpoint, CoolingItem, Kitchen, Reading, Settings } from '@templog/shared/schemas';
import { dayKeyOf } from '@templog/shared/tz';

import { allCheckpointRows } from './checkpoints-repo';
import { allCoolingItemRows } from './cooling-repo';
import { allKitchenRows, getActiveKitchen } from './kitchen-repo';
import { allReadingRows } from './readings-repo';
import { getSettings } from './settings-repo';
import { type DayRange, nowIso, todayKey } from './time';

export type AllDataExport = {
  app: 'templog';
  formatVersion: 1;
  exportedAt: string;
  /** Temperatures are °F (`valueF`, `limits`); timestamps ISO-8601 UTC. */
  temperatureUnit: 'F';
  settings: Settings;
  kitchens: Kitchen[];
  checkpoints: Checkpoint[];
  readings: Reading[];
  coolingItems: CoolingItem[];
};

const live = <T extends { deletedAt?: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

/** Every live row on this device (all kitchens), for the JSON export. */
export function buildAllDataExport(): AllDataExport {
  return {
    app: 'templog',
    formatVersion: 1,
    exportedAt: nowIso(),
    temperatureUnit: 'F',
    settings: getSettings(),
    kitchens: live(allKitchenRows()),
    checkpoints: live(allCheckpointRows()),
    readings: live(allReadingRows()).sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
    coolingItems: live(allCoolingItemRows()).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  };
}

/** First local day with a reading or cooling item in the active kitchen → today (null when empty). */
export function fullHistoryRange(): DayRange | null {
  const kitchen = getActiveKitchen();
  if (!kitchen) return null;
  const first = [
    ...live(allReadingRows(kitchen.id)).map((r) => r.takenAt),
    ...live(allCoolingItemRows(kitchen.id)).map((c) => c.startedAt),
  ].sort()[0];
  if (!first) return null;
  return { from: dayKeyOf(first, kitchen.tz), to: todayKey(kitchen.tz) };
}
