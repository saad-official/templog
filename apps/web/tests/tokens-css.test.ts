import { describe, expect, it } from "vitest";
import { colors } from "@templog/shared/tokens";
import { buildTokensCss } from "@/lib/tokens-css";

describe("buildTokensCss", () => {
  const css = buildTokensCss();

  it("puts every light token on :root", () => {
    expect(css).toMatch(/:root \{[^}]*--tl-color-surface: #F2F4F5;/);
    expect(css).toMatch(/:root \{[^}]*--tl-space-md: 16px;/);
    expect(css).toMatch(/:root \{[^}]*--tl-font-variant-display: tabular-nums;/);
  });

  it("switches colours for the .dark class and for a system dark preference without .light", () => {
    const dark = css.slice(css.indexOf(".dark {"), css.indexOf("}", css.indexOf(".dark {")));
    expect(dark).toContain(`--tl-color-surface: ${colors.dark.surface};`);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{/);
    const media = css.slice(css.indexOf("@media"), css.indexOf("}", css.indexOf("@media")));
    expect(media).toContain(`--tl-color-heat: ${colors.dark.heat};`);
  });

  it("only repeats tokens that change in dark", () => {
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).not.toContain("--tl-space-md");
    expect(dark).toContain("--tl-shadow-md");
  });

  it("lets any element force a scheme with data-scheme", () => {
    const block = (scheme: "light" | "dark") => {
      const start = css.indexOf(`[data-scheme="${scheme}"] {`);
      expect(start, scheme).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(block("dark")).toContain(`--tl-color-surface: ${colors.dark.surface};`);
    expect(block("light")).toContain(`--tl-color-surface: ${colors.light.surface};`);
    expect(block("light")).toContain("color-scheme: light;");
  });
});
