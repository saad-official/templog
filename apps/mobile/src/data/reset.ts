// Deletes every row of every table (used by "Delete all data").
import { db } from './db';
import { checkpoints, coolingItems, kitchens, readings, settings, syncState } from './schema';
import { notifyTables, TABLES } from './store';

export function wipeAllTables(): void {
  db.transaction((tx) => {
    for (const table of [readings, coolingItems, checkpoints, kitchens, settings, syncState]) {
      tx.delete(table).run();
    }
  });
  notifyTables(...TABLES);
}
