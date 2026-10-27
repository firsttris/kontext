/**
 * The built app compressed ahead of time (`bun run build`): next to each text file a `.br`
 * (Brotli, best quality) and a `.gz`, which the Kontext server hands out by the browser's
 * Accept-Encoding (serveStatic's `precompressed`, server/app.ts). Caddy cannot make Brotli on the
 * fly, and Safari takes no zstd: without these files phones with iOS got gzip at Caddy's level.
 * Compressed once per build, not per request.
 *
 * bun dev/precompress.ts [dist]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

/** Text the browser gets; images, fonts and PDFs are compressed in themselves. */
const TEXT = /\.(js|mjs|css|html|svg|json|webmanifest|txt|xml)$/;
/** Below this, the headers weigh more than what compression saves. */
const MIN_BYTES = 1024;

/** Whether a file of the build gets compressed copies. */
export const compressible = (name: string, size: number): boolean =>
  TEXT.test(name) && size >= MIN_BYTES;

/** A compressed copy only pays off when it is clearly smaller. */
export const worthIt = (original: number, compressed: number): boolean =>
  compressed < original * 0.9;

export const compressFile = async (path: string): Promise<{ br: number; gz: number } | null> => {
  const data = await readFile(path);
  if (!compressible(path, data.length)) return null;
  const [br, gzipped] = await Promise.all([
    brotli(data, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
      },
    }),
    gz(data, { level: constants.Z_BEST_COMPRESSION }),
  ]);
  if (!worthIt(data.length, br.length)) return null;
  await Promise.all([writeFile(`${path}.br`, br), writeFile(`${path}.gz`, gzipped)]);
  return { br: br.length, gz: gzipped.length };
};

export const precompress = async (dir: string) => {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  const results = await Promise.all(files.map(compressFile));
  return results.filter((result) => result !== null);
};

if (import.meta.main) {
  const dir = process.argv[2] ?? "dist";
  const done = await precompress(dir);
  const kb = (bytes: number) => Math.round(bytes / 1024);
  console.log(
    `${done.length} files compressed in ${dir}: ${kb(done.reduce((sum, r) => sum + r.br, 0))} kB Brotli, ${kb(done.reduce((sum, r) => sum + r.gz, 0))} kB gzip`,
  );
}
