import type { Checkpoint } from '@templog/shared/schemas';

import { getCheckpoint, listCheckpoints } from '@/data/checkpoints-repo';
import { getActiveKitchen } from '@/data/kitchen-repo';
import { useLiveQuery } from '@/data/store';
import { useToday } from '@/data/time';
import { checkpointHistory, type CheckpointHistory } from '@/data/views';

const EMPTY: Checkpoint[] = [];
const TABLES = ['checkpoints', 'kitchens', 'settings'] as const;

/** Live checkpoints of the active kitchen by `sortOrder`; archived ones only with `includeArchived`. */
export function useCheckpoints(opts: { includeArchived?: boolean } = {}): Checkpoint[] {
  const includeArchived = !!opts.includeArchived;
  return useLiveQuery(
    `checkpoints:${includeArchived}`,
    TABLES,
    () => {
      const kitchen = getActiveKitchen();
      return kitchen ? listCheckpoints(kitchen.id, { includeArchived }) : EMPTY;
    },
    EMPTY,
  );
}

/** One checkpoint (archived / deleted included: check `archivedAt` / `deletedAt`), or null. */
export function useCheckpoint(id: string | null | undefined): Checkpoint | null {
  return useLiveQuery(`checkpoint:${id ?? ''}`, TABLES, () => (id ? getCheckpoint(id) : null), null);
}

/**
 * A checkpoint's history: shared `checkpointStats` over the last `days` days (min / max / avg /
 * fails / sparkline `points`) plus its 10 most recent readings and limits label. Rolls at midnight.
 */
export function useCheckpointHistory(id: string | null | undefined, days = 7): CheckpointHistory | null {
  const today = useToday();
  return useLiveQuery(
    `checkpoint-history:${id ?? ''}:${days}`,
    ['checkpoints', 'readings', 'kitchens', 'settings'],
    () => (id ? checkpointHistory(id, days) : null),
    null,
    today,
  );
}
