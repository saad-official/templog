// Today board intents shared by the row variants and the due-now card.
import { router } from 'expo-router';

import { showToast } from '@/components/toast';
import { type CheckpointBoardItem, snoozeChecks } from '@/data';
import { haptics } from '@/native/haptics';

/** The check a tap on the row answers: the open (due / overdue) one, else nothing (logReading picks). */
export function openCheckFor(item: CheckpointBoardItem): string | undefined {
  const c = item.current;
  return c && (c.state === 'due' || c.state === 'overdue') ? c.check.scheduledFor : undefined;
}

export function openLog(checkpointId: string, scheduledFor?: string) {
  haptics.selection();
  router.push({ pathname: '/log/[checkpointId]', params: scheduledFor ? { checkpointId, scheduledFor } : { checkpointId } });
}

export function openHistory(checkpointId: string) {
  router.push({ pathname: '/history/checkpoint/[id]', params: { id: checkpointId } });
}

export function snooze(checkIds: string[]) {
  if (!checkIds.length) return;
  haptics.acknowledged();
  snoozeChecks(checkIds)
    .then(() => showToast({ message: 'Reminder snoozed for 15 minutes' }))
    .catch(() => showToast({ message: "Couldn't snooze. Please try again." }));
}
