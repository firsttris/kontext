/**
 * Outlook data files for the move tests, downloaded once into .dev/fixtures (not in the repo):
 * - enron.pst: 71 mails from the EDRM Enron data set (CC BY 3.0, ZL Technologies), via
 *   epfromer/pst-extractor (MIT)
 * - dist-list.pst: a contact and a weekly appointment, from rjohnsondev/java-libpst (Apache-2.0)
 * Pinned to a commit and checked by hash.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const FIXTURES = {
  "enron.pst": {
    url: "https://raw.githubusercontent.com/epfromer/pst-extractor/7d08ef9bc7112c23275fa948306c76bba6e24fba/src/__tests__/testdata/enron.pst",
    sha256: "6152489de3472be6f1f840935d34b6dbf5f62b025dd015929ea9cf66eb5a5b46",
  },
  "dist-list.pst": {
    url: "https://raw.githubusercontent.com/rjohnsondev/java-libpst/f158a64acf2a0e46ac3bd699bc7a5a8da6c40d26/src/test/resources/dist-list.pst",
    sha256: "c86841da106036b5abe5a2141dc7644cbb2bf8b504873515eb35a2efeb8c28ac",
  },
} as const;

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The local path of a fixture, downloaded on first use. */
export const pstFixture = async (name: keyof typeof FIXTURES): Promise<string> => {
  const dir = resolve(import.meta.dirname, "..", ".dev", "fixtures");
  const path = join(dir, name);
  const { url, sha256: expected } = FIXTURES[name];
  if (existsSync(path) && sha256(await readFile(path)) === expected) return path;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (sha256(data) !== expected) throw new Error(`${name}: falsche Prüfsumme`);
  await mkdir(dir, { recursive: true });
  await writeFile(path, data);
  return path;
};
