/**
 * The look keeps to a few scales (docs, "Gestaltung"): font sizes, icon sizes, one icon stroke
 * (styles.css), sizes on the 4px grid, sentence case, no italic, motion only on transform, colour
 * and opacity. A value off the scale creeps in one class at a time; this test names the line.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FONT_SIZES = new Set([11, 12, 13, 14, 16, 18, 22, 30]);
/** 10 only for a glyph inside a dot or a checkbox, 24 and 32 for empty states and large tiles. */
const ICON_SIZES = new Set([10, 12, 14, 16, 20, 24, 32]);

const files = readdirSync("src", { recursive: true, encoding: "utf8" })
  .map((file) => `src/${file}`)
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"));

type Line = { where: string; text: string };

const lines = (file: string): Line[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((text, index) => ({ where: `${file}:${index + 1}`, text }));

const all = files.flatMap(lines);

/** The lines where `pattern` finds something `bad`. */
const offenders = (pattern: RegExp, bad: (match: RegExpExecArray) => boolean = () => true) =>
  all.flatMap(({ where, text }) =>
    [...text.matchAll(new RegExp(pattern, "g"))].some(bad) ? [`${where}: ${text.trim()}`] : [],
  );

/** The names a file imports from lucide-react, plus `Icon`, the usual name of one passed in. */
const lucideNames = (code: string): Set<string> => {
  const names = new Set(["Icon"]);
  for (const [, list] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
    for (const entry of list!.split(",")) {
      const name = entry.trim().split(" as ").pop()!.trim();
      if (name && !name.startsWith("type ")) names.add(name);
    }
  }
  return names;
};

/** Every lucide element with its attributes, as `where` and the opening tag. */
const lucideTags = (): Line[] =>
  files.flatMap((file) => {
    const code = readFileSync(file, "utf8");
    if (!code.includes('"lucide-react"')) return [];
    const names = lucideNames(code);
    return [...code.matchAll(/<([A-Z]\w*)\b([^<>]*?)\/?>/gs)]
      .filter((match) => names.has(match[1]!))
      .map((match) => ({
        where: `${file}:${code.slice(0, match.index).split("\n").length}`,
        text: match[0].replace(/\s+/g, " "),
      }));
  });

describe("design rules", () => {
  it("keep font sizes on the scale", () => {
    expect(
      offenders(/(?<![\w[-])text-\[(\d+)px\]/, (match) => !FONT_SIZES.has(Number(match[1]))),
    ).toEqual([]);
  });

  it("keep icon sizes on the scale and leave the stroke to styles.css", () => {
    const tags = lucideTags();
    const sizes = tags.filter(({ text }) =>
      [...(text.match(/size=\{([^}]*)\}/)?.[1] ?? "").matchAll(/\b\d+\b/g)].some(
        ([value]) => !ICON_SIZES.has(Number(value)),
      ),
    );
    const strokes = tags.filter(({ text }) => text.includes("strokeWidth="));
    expect([...sizes, ...strokes].map(({ where, text }) => `${where}: ${text}`)).toEqual([]);
  });

  it("put sizes and radii on the 4px grid (2px steps only below 20px)", () => {
    const offGrid = (value: number) => value % 2 !== 0 || (value > 20 && value % 4 !== 0);
    expect(
      offenders(/(?<![\w-])(?:h|size|min-h|max-h|p|px|py|rounded)-\[(\d+)px\]/, (match) =>
        offGrid(Number(match[1])),
      ),
    ).toEqual([]);
  });

  it("write labels in sentence case without tight tracking or italic", () => {
    expect(offenders(/tracking-tight/)).toEqual([]);
    // Upper case only for codes typed in mono, like a recovery code.
    expect(
      all
        .filter(({ text }) => /(?<![\w-])uppercase\b/.test(text) && !text.includes("font-mono"))
        .map(({ where, text }) => `${where}: ${text.trim()}`),
    ).toEqual([]);
    expect(offenders(/(?<![(\w])["'`]italic["'`\s]|\sitalic(?=["'`\s])/)).toEqual([]);
  });

  it("animate no layout and don't grow on hover", () => {
    expect(offenders(/transition-all|hover:scale/)).toEqual([]);
  });
});
