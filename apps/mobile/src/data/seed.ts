// Development-only demo data: a kitchen with five checkpoints, six days of readings (a few fails
// with corrective actions, a few missed checks), and two running cooling timers, so Today,
// History, Cooling, the widgets and the Live Activities have something to show.
import { evaluateReading } from '@templog/shared/limits';
import type { Reading } from '@templog/shared/schemas';
import { addDaysToKey, zonedMidnight } from '@templog/shared/tz';

import { addCheckpoint, logCoolingReading, startCooling } from './actions';
import { checksForDays } from './checks';
import { listCheckpoints, saveCheckpoint } from './checkpoints-repo';
import { ensureKitchen, patchKitchen } from './kitchen-repo';
import { newId } from './mappers';
import { putReadings } from './readings-repo';
import { updateSettings } from './settings-repo';
import { todayKey } from './time';

const MINUTE = 60_000;
const INITIALS = ['SK', 'JD', 'MR', 'AL'];

/**
 * Seeds demo data once (no-op when checkpoints exist). Throws outside `__DEV__` so it can never
 * run in a release build.
 */
export async function seedDemoData(): Promise<{ seeded: boolean }> {
  if (!__DEV__) throw new Error('seedDemoData is development-only');
  const kitchen = ensureKitchen();
  if (listCheckpoints(kitchen.id, { includeArchived: true }).length) return { seeded: false };

  updateSettings({ onboarded: true, initialsDefault: 'SK' });
  patchKitchen(kitchen.id, { name: 'Corner Café' });

  const checkpoints = [
    await addCheckpoint({ name: 'Walk-in fridge', kind: 'cold-holding', cadence: { kind: 'every', hours: 4 } }),
    await addCheckpoint({ name: 'Reach-in 1', kind: 'cold-holding', cadence: { kind: 'times', times: ['09:00', '15:00', '20:00'] } }),
    await addCheckpoint({ name: 'Hot well', kind: 'hot-holding', cadence: { kind: 'every', hours: 2 } }),
    await addCheckpoint({ name: 'Chest freezer', kind: 'freezer', cadence: { kind: 'times', times: ['08:00', '18:00'] } }),
    await addCheckpoint({ name: 'Deliveries', kind: 'receiving', cadence: { kind: 'times', times: ['10:00'] } }),
  ];

  // Backdate so the last six days have checks, then log most of them.
  const tz = kitchen.tz;
  const today = todayKey(tz);
  const first = addDaysToKey(today, -6);
  const createdAt = new Date(zonedMidnight(first, tz)).toISOString();
  const backdated = checkpoints.map((c) => saveCheckpoint({ ...c, createdAt }));

  const now = Date.now();
  const typical: Record<string, number> = { 'cold-holding': 37, 'hot-holding': 148, freezer: -4, receiving: 38, cooking: 170 };
  const rows: Reading[] = [];
  let i = 0;
  for (const check of checksForDays(kitchen, backdated, first, today)) {
    const due = Date.parse(check.scheduledFor);
    if (due > now - 30 * MINUTE) continue; // leave today's recent / upcoming checks open
    i++;
    if (i % 13 === 5) continue; // a missed check, shown as missed (never filled in)
    const checkpoint = backdated.find((c) => c.id === check.checkpointId)!;
    const fail = i % 17 === 3;
    const base = typical[checkpoint.kind] ?? 40;
    const valueF = fail ? (checkpoint.kind === 'hot-holding' ? 128 : base + 9) : base + ((i * 7) % 5) - 2;
    const evaluation = evaluateReading(checkpoint, valueF);
    const takenAt = new Date(due + ((i * 11) % 25) * MINUTE).toISOString();
    rows.push({
      id: newId(Date.parse(takenAt)),
      kitchenId: kitchen.id,
      checkpointId: checkpoint.id,
      coolingItemId: null,
      scheduledFor: check.scheduledFor,
      takenAt,
      valueF,
      result: evaluation.result,
      failReason: evaluation.failReason,
      correctiveAction:
        evaluation.result === 'fail'
          ? checkpoint.kind === 'hot-holding'
            ? { kind: 'reheat', note: 'Reheated to 165 °F' }
            : { kind: 'move', note: 'Moved to reach-in 2' }
          : null,
      initials: INITIALS[i % INITIALS.length]!,
      source: 'manual',
      createdAt: takenAt,
      updatedAt: takenAt,
      deletedAt: null,
    });
  }
  putReadings(rows);

  // Cooling: one item just off heat, one that passed stage 1 and is in stage 2.
  await startCooling('Chili (6 qt)', { initials: 'SK', startValue: 160, unit: 'F', startedAt: new Date(now - 25 * MINUTE).toISOString() });
  const rice = await startCooling('Rice', { initials: 'JD', startValue: 150, unit: 'F', startedAt: new Date(now - 140 * MINUTE).toISOString() });
  await logCoolingReading(rice.id, 64, 'JD', { unit: 'F', takenAt: new Date(now - 30 * MINUTE).toISOString() });

  return { seeded: true };
}
