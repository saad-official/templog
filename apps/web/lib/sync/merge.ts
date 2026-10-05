/**
 * Last-write-wins merge for mirrored rows. Pure (shared by the server and its
 * tests). A row's version is the later of `updatedAt` and `deletedAt`,
 * compared as instants, so a newer delete beats an older edit and a newer
 * edit beats (revives) an older delete. Ties go to the incoming row.
 */
export type Versioned = { updatedAt: string; deletedAt?: string | null };

export function rowVersion(row: Versioned): number {
  const updated = Date.parse(row.updatedAt);
  const deleted = row.deletedAt ? Date.parse(row.deletedAt) : Number.NEGATIVE_INFINITY;
  return Math.max(updated, deleted);
}

export function pickWinner<T extends Versioned>(stored: T, incoming: T): T {
  return rowVersion(incoming) >= rowVersion(stored) ? incoming : stored;
}
