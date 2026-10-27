import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("iOS edge blur", () => {
  it("pads the top by the shared inset, not the bare safe area", () => {
    expect(css).toMatch(/@utility safe-top \{\s*padding-top: var\(--safe-top\);/);
  });

  // The blur reaches about 40pt below the status bar in the installed iPhone app (iOS 26).
  it("clears the blur only in the installed app on iOS in portrait", () => {
    expect(css).toMatch(
      /@supports \(-webkit-touch-callout: none\) \{\s*@media \(display-mode: standalone\) and \(orientation: portrait\) \{\s*:root \{\s*--safe-top: calc\(env\(safe-area-inset-top\) \+ 2\.5rem\);/,
    );
  });
});
