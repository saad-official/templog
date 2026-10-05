import type { Appearance as AppearancePreference } from '@templog/shared/schemas';
import { type ReactNode, useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { useSettings } from '@/hooks/use-settings';

import { buildAppTheme } from './palette';
import { ThemeContext } from './theme-context';

/** Pushes the Settings override (`settings.appearance`) to React Native so native views and `useColorScheme()` follow it. */
function applyAppearance(pref: AppearancePreference) {
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

/**
 * Theme root: the system colour scheme, or the Appearance override from Settings (System / Light /
 * Dark), resolved into one memoised theme object.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { appearance } = useSettings();
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  // Resolve the forced scheme here too, so the first frame after a change is already right.
  const scheme = appearance === 'system' ? system : appearance;
  useEffect(() => applyAppearance(appearance), [appearance]);
  return <ThemeContext value={buildAppTheme(scheme)}>{children}</ThemeContext>;
}
