// Shared pieces of the cooling status surfaces (iOS Live Activity `Cooling`, Android Live Update /
// ongoing notification): the event every surface reports and the view model they render.
import { COOLING_LIMITS, type CoolingStage } from '@templog/shared/cooling';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';

import type { CoolingView } from '@/data/views';

import { deepLinks } from './notifications';
import { widgetPalette, type WidgetPalette } from './widget-snapshot';

export type StatusActionSource = 'live-activity' | 'live-update' | 'notification';

/**
 * One event for every "do something" tap outside the app UI:
 * - `log-now` (check reminder) / `log-reading` (cooling prompt, Live Activity): open the entry
 *   screen at `url` (`templog://log/<checkpointId>`, `templog://cooling/<itemId>`);
 * - `snooze-15` (check reminder): the reminder comes back in 15 minutes;
 * - `discarded` (cooling prompt, Live Activity): the item is closed as discarded.
 * Background actions are applied by native/status-actions.ts before listeners see them.
 */
export type StatusAction = {
  action: 'log-now' | 'snooze-15' | 'log-reading' | 'discarded';
  checkIds?: string[];
  checkpointId?: string | null;
  itemId?: string | null;
  url?: string | null;
  source: StatusActionSource;
};

export type StatusActionListener = (event: StatusAction) => void;

export type CoolingStatusView = {
  itemId: string;
  name: string;
  stage: CoolingStage;
  /** `Stage 1 · ≤ 70 °F` */
  stageLabel: string;
  /** Shared `coolingLabel`: `Stage 1: ≤ 70 °F in 1 h 12 m`, `Stage 2 overdue by 5 m`. */
  label: string;
  /** Start of the open stage's clock (stage 2 runs from the stage-1 pass) and its deadline. */
  stageStartMs: number;
  dueAtMs: number;
  /** 0…1 of the open stage's time used. */
  progress: number;
  /** 0…1 of the whole 6-hour window used (Android segmented progress). */
  totalProgress: number;
  overdue: boolean;
  url: string;
  palette: WidgetPalette;
};

const HOUR = 3_600_000;

export function toCoolingStatusView(item: CoolingView, unit: Unit, now = Date.now()): CoolingStatusView | null {
  if (!item.prompt) return null;
  const stage = item.prompt.kind;
  const max = stage === 'stage1' ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
  const start = Date.parse(item.startedAt);
  const stageStart = stage === 'stage1' ? start : Date.parse(item.stage1At ?? item.deadlines.stage1DueAt);
  const total = COOLING_LIMITS.totalHours * HOUR;
  return {
    itemId: item.id,
    name: item.name,
    stage,
    stageLabel: `${stage === 'stage1' ? 'Stage 1' : 'Stage 2'} · ≤ ${formatTemp(displayTemp(max, unit), unit)}`,
    label: item.label,
    stageStartMs: stageStart,
    dueAtMs: Date.parse(item.prompt.dueAt),
    progress: item.progress,
    totalProgress: Math.min(1, Math.max(0, (now - start) / total)),
    overdue: item.prompt.minutesLeft < 0,
    url: deepLinks.cooling(item.id),
    palette: widgetPalette(),
  };
}
