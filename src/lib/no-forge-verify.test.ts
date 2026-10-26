// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every source file of the app and the server. */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "paraglide" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

describe("signatures", () => {
  it("are never checked with node-forge (GHSA-86w9-cpqp-85rv, no fixed version)", () => {
    const checking = [...sources("src"), ...sources("server")].filter((path) =>
      /publicKey\.verify\(|verifyCertificateChain|\.pkcs7\.[a-zA-Z.]*verify/i.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(checking).toEqual([]);
  });
});
