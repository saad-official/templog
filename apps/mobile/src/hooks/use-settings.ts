import { DEFAULT_SETTINGS, type Settings } from '@templog/shared/schemas';

import { getSettings } from '@/data/settings-repo';
import { useLiveQuery } from '@/data/store';

/**
 * Device settings (shared `SettingsSchema`, defaults applied; `DEFAULT_SETTINGS` until the database
 * is ready): `onboarded`, `unit` (display unit), `initialsDefault`, `reminderLeadMinutes`,
 * `quietOutsideHours`, `graceMinutes`, `appearance` (`system` | `light` | `dark`). Write with `updateSettings(patch)` from `@/data`, which also
 * reschedules reminders when they are affected.
 */
export function useSettings(): Settings {
  return useLiveQuery('settings', ['settings'], getSettings, DEFAULT_SETTINGS);
}
