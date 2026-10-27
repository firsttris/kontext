/**
 * The app's texts reach a page only as `m.name`. A computed `m[…]` or `m` handed on as a whole
 * makes the bundler keep every message for every page: once, through the shortcuts help in the
 * app shell, that was some 1600 texts and 40 kB (gzip) in the chunk each page loads.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const IMPORT = /^import \{ m \} from "@\/paraglide\/messages";$/m;
// `m` not followed by `.name`; not the "m-0" of a class name, the "m" flag of a RegExp or a key `m:`.
const BARE = /(?<![\w$.\-"'`])m(?!\s*\.\s*[A-Za-z_$])(?![\w$\-"'`:])/g;

const files = readdirSync("src", { recursive: true, encoding: "utf8" })
  .map((file) => `src/${file}`)
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .filter((file) => !file.startsWith("src/paraglide/"));

describe("messages", () => {
  it("are used by name only", () => {
    const offenders = files.flatMap((file) => {
      const code = readFileSync(file, "utf8");
      if (!IMPORT.test(code)) return [];
      return code
        .replace(IMPORT, "")
        .split("\n")
        .flatMap((line, index) =>
          line.match(BARE) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
        );
    });
    expect(offenders).toEqual([]);
  });
});
