import { createContext, use } from 'react';

import { buildAppTheme, type AppTheme } from './palette';

export const ThemeContext = createContext<AppTheme>(buildAppTheme('light'));

/** The resolved theme for the current colour scheme (system, or the Settings override). */
export function useTheme(): AppTheme {
  return use(ThemeContext);
}
