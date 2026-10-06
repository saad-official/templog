// Resolves the shared "stainless and heat" palette for a colour scheme into what the UI paints with.
// Pure (no React) and memoised, so every consumer shares one theme object per scheme.
import { colors as palettes, SHADOW_COLOR, shadows, type ColorPalette, type ColorScheme, type ShadowLevel } from '@templog/shared/tokens';

export type ThemeColors = ColorPalette & {
  /** Inverted surface for toasts. */
  inverseSurface: string;
  inverseText: string;
  /** Action text on the inverse surface (the toast "Undo"). */
  inverseAction: string;
  /** Primary action fill: ink on steel (heat is reserved for fails and cooling timers). */
  action: string;
  actionPressed: string;
  onAction: string;
  /** Dimmed backdrop behind transient overlays. */
  scrim: string;
  /**
   * Control fill (text fields, chips, steppers, secondary buttons, skeletons, stat tiles, icon
   * wells): reads on the page surface, sheets and elevated cards alike. `surfaceSunken` stays for
   * the keypad well and pressed rows on elevated groups; in dark it is darker than the page, so a
   * control on `surface` painted with it disappears (1.05:1).
   */
  fill: string;
  /** Unfilled part of rings and bars. */
  track: string;
  /** Keypad keys: raised steel caps on the sunken well. */
  key: string;
  keyPressed: string;
};

export type AppTheme = {
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  /** CSS `boxShadow` for an elevation level (never legacy shadow props). */
  shadow: (level: ShadowLevel) => string;
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#RRGGBB` + alpha → `rgba(...)`: translucent tints derived from theme roles. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Blends two `#RRGGBB` roles (`t` = 0 → `a`, 1 → `b`) so derived roles stay on the steel ramp. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`.toUpperCase();
}

const SHADOW_RGB = rgb(SHADOW_COLOR).join(', ');
const cache = new Map<ColorScheme, AppTheme>();

export function buildAppTheme(scheme: ColorScheme): AppTheme {
  const hit = cache.get(scheme);
  if (hit) return hit;
  const base = palettes[scheme];
  const inverse = palettes[scheme === 'dark' ? 'light' : 'dark'];
  const isDark = scheme === 'dark';
  // Light: the sunken steel already reads on white and on the page. Dark: a lifted steel between
  // the card and the border (1.4:1 on the page, 1.25:1 on cards) instead of a near-black hole.
  const fill = isDark ? mix(base.surfaceElevated, base.border, 0.5) : base.surfaceSunken;
  const colors: ThemeColors = {
    ...base,
    // Native hairlines are one device pixel, far thinner than the 1px CSS line the shared token is
    // tuned for: lean towards `border` so list separators stay visible (1.5:1 light, 1.4:1 dark).
    separator: mix(base.separator, base.border, isDark ? 0.6 : 0.5),
    inverseSurface: inverse.surfaceElevated,
    inverseText: inverse.text,
    inverseAction: inverse.heatText,
    action: base.text,
    actionPressed: base.textSecondary,
    onAction: base.surfaceElevated,
    scrim: `rgba(${SHADOW_RGB}, ${isDark ? 0.6 : 0.35})`,
    fill,
    track: fill,
    // Dark caps must be lighter than the near-black well, or the keypad reads as floating digits.
    key: isDark ? fill : base.surfaceElevated,
    keyPressed: base.border,
  };
  const levels = shadows[scheme];
  const theme: AppTheme = {
    scheme,
    isDark,
    colors,
    shadow: (level) => {
      const s = levels[level];
      return `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px rgba(${SHADOW_RGB}, ${s.opacity})`;
    },
  };
  cache.set(scheme, theme);
  return theme;
}
