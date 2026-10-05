/**
 * Templog design tokens: one source for the Expo app (`apps/mobile/src/theme`)
 * and the web (`toCssVars` -> `apps/web/app/globals.css`). Pure data, no deps.
 *
 * Identity: "stainless and heat". Cool steel surfaces, ink text, a heat
 * orange-red for fails and cooling timers, cold blue for cold holding, pass
 * green, amber for due-soon. Readings are the hero: a 48-pt tabular numeric
 * display so digits never jump width. Numbers are unitless (points on mobile,
 * CSS px on the web).
 *
 * Colour roles come in families: a fill (`heat`), its pressed state, a soft
 * tint for chips and wells (`heatSoft`), a text-safe variant (`heatText`,
 * WCAG AA on surfaces and on the soft tint) and the ink for content on the
 * fill (`onHeat`, AA on the fill). Never set small text in a fill colour.
 */

export type ColorScheme = "light" | "dark";

export type ColorRole =
  | "surface"
  | "surfaceElevated"
  | "surfaceSunken"
  | "text"
  | "textSecondary"
  | "textTertiary"
  | "heat"
  | "heatPressed"
  | "heatSoft"
  | "heatText"
  | "onHeat"
  | "cold"
  | "coldPressed"
  | "coldSoft"
  | "coldText"
  | "onCold"
  | "pass"
  | "passSoft"
  | "passText"
  | "onPass"
  | "warning"
  | "warningSoft"
  | "warningText"
  | "onWarning"
  | "separator"
  | "border";

export type ColorPalette = Record<ColorRole, string>;

export const colors = {
  light: {
    /** Brushed steel: page and screen background. */
    surface: "#F2F4F5",
    /** Cards, sheets, the keypad. */
    surfaceElevated: "#FFFFFF",
    /** Wells, inputs, inset lists. */
    surfaceSunken: "#E3E8EA",
    /** Ink. */
    text: "#12191C",
    textSecondary: "#46535A",
    /** Placeholders and disabled labels only (not body copy). */
    textTertiary: "#7A868C",
    /** Heat: fails, cooling timers, the primary action. */
    heat: "#E8562A",
    heatPressed: "#CC4519",
    heatSoft: "#FCE4DA",
    heatText: "#A8360D",
    onHeat: "#1C0903",
    /** Cold holding. */
    cold: "#2F7FD6",
    coldPressed: "#2569B5",
    coldSoft: "#DFEBF9",
    coldText: "#1C5A9E",
    onCold: "#020B16",
    /** In range. */
    pass: "#2E9E6B",
    passSoft: "#DCF2E6",
    passText: "#1B6845",
    onPass: "#03140B",
    /** Due soon, approaching a limit. */
    warning: "#E0A21B",
    warningSoft: "#FBEFD3",
    warningText: "#845300",
    onWarning: "#1F1500",
    separator: "#DAE0E3",
    border: "#BFC8CD",
  },
  dark: {
    surface: "#0F1416",
    surfaceElevated: "#192125",
    surfaceSunken: "#090D0F",
    text: "#EDF1F2",
    textSecondary: "#A2AEB4",
    textTertiary: "#6B777D",
    heat: "#F2683C",
    heatPressed: "#FF8660",
    heatSoft: "#3A1A0F",
    heatText: "#FF8F68",
    onHeat: "#1C0903",
    cold: "#4A95E8",
    coldPressed: "#6FAAF0",
    coldSoft: "#0F243B",
    coldText: "#82B7F3",
    onCold: "#020B16",
    pass: "#3DBB82",
    passSoft: "#0E2C1F",
    passText: "#62D3A0",
    onPass: "#03140B",
    warning: "#E8B04B",
    warningSoft: "#33270F",
    warningText: "#F1C670",
    onWarning: "#1F1500",
    separator: "#232C31",
    border: "#36424A",
  },
} as const satisfies Record<ColorScheme, ColorPalette>;

/** 4-pt spacing scale. */
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export type SpacingToken = keyof typeof spacing;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export type RadiusToken = keyof typeof radius;

/** React Native `fontWeight` strings; valid CSS `font-weight` values too. */
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;
export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

export type TextStyleToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  /** Tracking in points/px (RN `letterSpacing`). */
  letterSpacing: number;
  /** Tabular figures (RN `fontVariant: ["tabular-nums"]`, CSS `font-variant-numeric`). */
  tabularNums: boolean;
};

/**
 * `display` is the reading itself (keypad entry, the latest temperature on a
 * checkpoint card, a cooling countdown): big and tabular. Scales with
 * Dynamic Type and Android font scale on device.
 */
export const type = {
  display: { fontSize: 48, lineHeight: 54, fontWeight: fontWeight.semibold, letterSpacing: -1, tabularNums: true },
  title: { fontSize: 28, lineHeight: 34, fontWeight: fontWeight.bold, letterSpacing: -0.4, tabularNums: false },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.semibold, letterSpacing: -0.2, tabularNums: false },
  body: { fontSize: 17, lineHeight: 24, fontWeight: fontWeight.regular, letterSpacing: -0.1, tabularNums: false },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: fontWeight.regular, letterSpacing: 0, tabularNums: false },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.medium, letterSpacing: 0.1, tabularNums: false },
} as const satisfies Record<string, TextStyleToken>;
export type TypeToken = keyof typeof type;

export type SpringConfig = { damping: number; stiffness: number; mass: number };
export type Bezier = readonly [number, number, number, number];

export const motion = {
  /** Milliseconds. */
  duration: { fast: 150, base: 250, slow: 400 },
  /** Cubic-bezier control points (CSS `cubic-bezier()`, Reanimated `Easing.bezier`). */
  easing: {
    standard: [0.2, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
  },
  /** Reanimated `withSpring` configs. */
  spring: {
    /** Keypad presses, pass/fail chips, toggles: quick and settled. */
    snappy: { damping: 22, stiffness: 320, mass: 0.8 },
    /** Sheets, cards, the cooling ring. */
    gentle: { damping: 24, stiffness: 140, mass: 1 },
  },
} as const satisfies {
  duration: Record<string, number>;
  easing: Record<string, Bezier>;
  spring: Record<string, SpringConfig>;
};

export type ShadowToken = {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  /** Shadow colour is always `SHADOW_COLOR`; opacity carries the weight. */
  opacity: number;
  /** Android elevation equivalent. */
  elevation: number;
};

export const SHADOW_COLOR = "#0B1114";

export const shadows = {
  light: {
    sm: { offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.08, elevation: 1 },
    md: { offsetX: 0, offsetY: 6, blur: 18, spread: -4, opacity: 0.14, elevation: 4 },
    lg: { offsetX: 0, offsetY: 20, blur: 44, spread: -12, opacity: 0.22, elevation: 12 },
  },
  dark: {
    sm: { offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.45, elevation: 1 },
    md: { offsetX: 0, offsetY: 6, blur: 18, spread: -4, opacity: 0.55, elevation: 4 },
    lg: { offsetX: 0, offsetY: 20, blur: 44, spread: -12, opacity: 0.65, elevation: 12 },
  },
} as const satisfies Record<ColorScheme, Record<"sm" | "md" | "lg", ShadowToken>>;
export type ShadowLevel = keyof (typeof shadows)["light"];

export const tokens = { colors, spacing, radius, fontWeight, type, motion, shadows } as const;
export type Tokens = typeof tokens;

export type CssVarName = `--tl-${string}`;

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function shadowCss(shadow: ShadowToken): string {
  const r = parseInt(SHADOW_COLOR.slice(1, 3), 16);
  const g = parseInt(SHADOW_COLOR.slice(3, 5), 16);
  const b = parseInt(SHADOW_COLOR.slice(5, 7), 16);
  return `${shadow.offsetX} ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px rgb(${r} ${g} ${b} / ${shadow.opacity})`;
}

/**
 * Flat `--tl-*` custom properties for one scheme, e.g. `--tl-color-on-heat`,
 * `--tl-space-md: 16px`, `--tl-font-size-display: 48px`,
 * `--tl-font-variant-display: tabular-nums`. Non-colour tokens are identical
 * in both schemes.
 */
export function toCssVars(scheme: ColorScheme): Record<CssVarName, string> {
  const vars: Record<CssVarName, string> = {};
  for (const [role, value] of Object.entries(colors[scheme])) vars[`--tl-color-${kebab(role)}`] = value;
  for (const [name, value] of Object.entries(spacing)) vars[`--tl-space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(radius)) vars[`--tl-radius-${name}`] = `${value}px`;
  for (const [name, style] of Object.entries(type)) {
    vars[`--tl-font-size-${name}`] = `${style.fontSize}px`;
    vars[`--tl-line-height-${name}`] = `${style.lineHeight}px`;
    vars[`--tl-font-weight-${name}`] = style.fontWeight;
    vars[`--tl-letter-spacing-${name}`] = `${style.letterSpacing}px`;
    vars[`--tl-font-variant-${name}`] = style.tabularNums ? "tabular-nums" : "normal";
  }
  for (const [name, ms] of Object.entries(motion.duration)) vars[`--tl-duration-${name}`] = `${ms}ms`;
  for (const [name, points] of Object.entries(motion.easing)) {
    vars[`--tl-ease-${name}`] = `cubic-bezier(${points.join(", ")})`;
  }
  for (const [name, shadow] of Object.entries(shadows[scheme])) vars[`--tl-shadow-${name}`] = shadowCss(shadow);
  return vars;
}
