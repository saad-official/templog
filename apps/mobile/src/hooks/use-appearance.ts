// UI-only: the Appearance override (System / Light / Dark). Device-local, so it lives in the
// app-local settings values rather than the shared `Settings` schema (which has no such field).
import { getAppValue, setAppValue } from '@/data/settings-repo';
import { useLiveQuery } from '@/data/store';

export type AppearancePreference = 'system' | 'light' | 'dark';

const KEY = 'appearance';
const VALUES: readonly string[] = ['system', 'light', 'dark'];

function read(): AppearancePreference {
  const value = getAppValue<string>(KEY, 'system');
  return VALUES.includes(value) ? (value as AppearancePreference) : 'system';
}

/** The stored appearance preference (`system` until the database is ready). */
export function useAppearance(): AppearancePreference {
  return useLiveQuery('ui-appearance', ['settings'], read, 'system');
}

export function setAppearance(pref: AppearancePreference): void {
  setAppValue(KEY, pref === 'system' ? undefined : pref);
}
