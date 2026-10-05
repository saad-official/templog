import { describe, expect, it } from "vitest";
import { colors, motion, radius, shadows, spacing, toCssVars, type, type ColorScheme } from "@templog/shared/tokens";
import { contrast } from "./contrast";

const SCHEMES: ColorScheme[] = ["light", "dark"];

describe("design tokens: stainless and heat", () => {
  it("uses cool steel surfaces, the heat accent, cold blue and pass green", () => {
    expect(colors.light.surface).toBe("#F2F4F5");
    expect(colors.dark.surface).toBe("#0F1416");
    expect(colors.light.heat).toBe("#E8562A");
    expect(colors.light.cold).toBe("#2F7FD6");
    expect(colors.light.pass).toBe("#2E9E6B");
  });

  it("gives both schemes the same colour roles", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it.each(SCHEMES)("meets WCAG AA for text in %s", (scheme) => {
    const c = colors[scheme];
    for (const bg of [c.surface, c.surfaceElevated]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.heatText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.coldText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.passText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.warningText, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onHeat, c.heat)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onCold, c.cold)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPass, c.pass)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.heatText, c.heatSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.coldText, c.coldSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.passText, c.passSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warningText, c.warningSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps non-text fills distinguishable from the surface (3:1)", () => {
    for (const scheme of SCHEMES) {
      const c = colors[scheme];
      for (const fill of [c.heat, c.cold, c.pass]) expect(contrast(fill, c.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses a 4-pt spacing scale and the agreed radii", () => {
    for (const value of Object.values(spacing)) expect(value % 4).toBe(0);
    expect(radius).toEqual({ sm: 8, md: 14, lg: 20, pill: 999 });
  });

  it("has a 48pt tabular display for readings and the agreed type scale", () => {
    expect([type.display, type.title, type.headline, type.body, type.callout, type.caption].map((t) => t.fontSize)).toEqual([
      48, 28, 20, 17, 15, 13,
    ]);
    expect(type.display.tabularNums).toBe(true);
    for (const style of Object.values(type)) expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.1);
  });

  it("defines motion: three durations and the snappy and gentle springs", () => {
    expect(motion.duration).toEqual({ fast: 150, base: 250, slow: 400 });
    expect(Object.keys(motion.spring).sort()).toEqual(["gentle", "snappy"]);
    expect(motion.spring.snappy.stiffness).toBeGreaterThan(motion.spring.gentle.stiffness);
  });

  it("has three shadow levels per scheme", () => {
    for (const scheme of SCHEMES) expect(Object.keys(shadows[scheme])).toEqual(["sm", "md", "lg"]);
  });
});

describe("toCssVars", () => {
  it("flattens a scheme into --tl-* custom properties with CSS units", () => {
    const vars = toCssVars("light");
    expect(vars["--tl-color-surface"]).toBe("#F2F4F5");
    expect(vars["--tl-color-on-heat"]).toBe(colors.light.onHeat);
    expect(vars["--tl-space-md"]).toBe("16px");
    expect(vars["--tl-radius-md"]).toBe("14px");
    expect(vars["--tl-radius-pill"]).toBe("999px");
    expect(vars["--tl-font-size-display"]).toBe("48px");
    expect(vars["--tl-font-variant-display"]).toBe("tabular-nums");
    expect(vars["--tl-font-variant-body"]).toBe("normal");
    expect(vars["--tl-duration-base"]).toBe("250ms");
    expect(vars["--tl-shadow-md"]).toMatch(/^0 \d+px \d+px/);
    for (const key of Object.keys(vars)) expect(key).toMatch(/^--tl-[a-z0-9-]+$/);
  });

  it("differs between schemes only in colours and shadows", () => {
    const light = toCssVars("light");
    const dark = toCssVars("dark");
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    const changed = Object.keys(light).filter((k) => light[k as keyof typeof light] !== dark[k as keyof typeof dark]);
    expect(changed.length).toBeGreaterThan(0);
    for (const key of changed) expect(key).toMatch(/^--tl-(color|shadow)-/);
  });
});
