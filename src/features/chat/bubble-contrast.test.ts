import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The ink in a chat bubble (message-text.tsx) must keep WCAG AA (4.5:1) on both bubbles in both
 * themes: links in `accent-ink`, mentions of others in `accent-ink` on `bg-accent/10`, the
 * "edited" note in `muted`.
 */
const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = (selector: string) => {
  const block = css.split(`${selector} {`)[1]?.split("}")[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1]!, match[2]!]),
  );
};
const light = tokens(":root");
const dark = { ...light, ...tokens(":root.dark") };

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const over = (top: Rgb, below: Rgb, alpha: number): Rgb =>
  top.map((value, i) => value * alpha + below[i]! * (1 - alpha)) as Rgb;
const luminance = (color: Rgb) => {
  const [r, g, b] = color.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};

describe("chat bubble contrast", () => {
  for (const [theme, t] of Object.entries({ light, dark })) {
    for (const bubble of ["bubble", "bubble-own"]) {
      const behind = rgb(t[bubble]!);
      it(`keeps 4.5:1 for links, mentions and the edited note on ${bubble} (${theme})`, () => {
        expect(contrast(rgb(t["accent-ink"]!), behind)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(rgb(t["accent-ink"]!), over(rgb(t.accent!), behind, 0.1)),
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb(t.muted!), behind)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
