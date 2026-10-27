import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The selectors of the rule that keeps iOS Safari from zooming into fields (styles.css). */
const noZoomSelectors = (): string[] => {
  const block = css.split("@supports (-webkit-touch-callout: none) {")[1] ?? "";
  return (block.split("{")[0] ?? "").split(",").map((selector) => selector.trim());
};

describe("iOS field zoom", () => {
  // The compose editor's own unlayered 15px is more specific than [contenteditable]: without its
  // own selector the iPhone zoomed in while writing a mail and stayed zoomed in.
  it("reaches every field with its own unlayered font size", () => {
    const unlayered = [...css.matchAll(/^([.#[a-z][^{}]*?)\s*\{[^}]*font-size:/gm)].map((match) =>
      match[1]!.trim(),
    );
    expect(unlayered).toContain(".editor-content .ProseMirror");
    for (const selector of unlayered) expect(noZoomSelectors()).toContain(selector);
  });
});
