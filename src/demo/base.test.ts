/**
 * Where the demo build is served: the default `base` of `vite build --mode demo` (vite.config.ts)
 * is what the development docs tell a reader to serve `dist-demo/` under, in both languages.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

const demoBase = () => {
  const match = read("vite.config.ts").match(/DEMO_BASE \?\? "([^"]+)"/);
  if (!match?.[1]) throw new Error("no default DEMO_BASE in vite.config.ts");
  return match[1];
};

describe("demo base path", () => {
  it.each(["docs/development.md", "docs/development.en.md"])(
    "%s names the build's default base and no other path for the demo",
    (file) => {
      const text = read(file);
      const base = demoBase();
      const paths = [...text.matchAll(/`(\/[^`\s]*demo\/)`/g)].map((m) => m[1]);
      expect(paths.filter((path) => path !== base)).toEqual([]);
      expect(paths).toContain(base);
    },
  );
});
