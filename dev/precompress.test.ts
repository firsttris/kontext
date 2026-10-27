import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { compressible, precompress, worthIt } from "./precompress";

let dir = "";
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("precompress", () => {
  it("compresses text files of some size, nothing else", () => {
    expect(compressible("assets/index-abc.js", 50_000)).toBe(true);
    expect(compressible("index.html", 2_000)).toBe(true);
    expect(compressible("manifest.webmanifest", 2_000)).toBe(true);
    expect(compressible("assets/geist.woff2", 50_000)).toBe(false);
    expect(compressible("icon-512.png", 50_000)).toBe(false);
    expect(compressible("theme.js", 300)).toBe(false);
    expect(worthIt(10_000, 3_000)).toBe(true);
    expect(worthIt(10_000, 9_500)).toBe(false);
  });

  it("puts a .br and a .gz next to each, which unpack to the original", async () => {
    dir = await mkdtemp(join(tmpdir(), "precompress-"));
    const script = "export const greeting = () => 'Guten Morgen';\n".repeat(200);
    await writeFile(join(dir, "app.js"), script);
    await writeFile(join(dir, "tiny.js"), "x");
    await writeFile(join(dir, "font.woff2"), Buffer.alloc(4096));

    await precompress(dir);

    expect((await readdir(dir)).sort()).toEqual([
      "app.js",
      "app.js.br",
      "app.js.gz",
      "font.woff2",
      "tiny.js",
    ]);
    expect(brotliDecompressSync(await readFile(join(dir, "app.js.br"))).toString()).toBe(script);
    expect(gunzipSync(await readFile(join(dir, "app.js.gz"))).toString()).toBe(script);
  });
});
