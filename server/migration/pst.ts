/**
 * Opening an Outlook data file (PST) with readpst from libpst (pst-utils): one file per mail
 * (.eml), contact (.vcf) and appointment (.ics), in a directory per Outlook folder.
 */
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export type PstItem = { kind: "mail" | "contact" | "event"; folder: string[]; file: string };

const KINDS: Record<string, PstItem["kind"]> = { eml: "mail", vcf: "contact", ics: "event" };

/** Writes the items of `pstFile` below `outDir`; throws with readpst's message on failure. */
export const extractPst = async (pstFile: string, outDir: string): Promise<void> => {
  // -e: one file per item with extension; -8: UTF-8 bodies; -cv: contacts as vCard; -q: quiet.
  const child = Bun.spawn(["readpst", "-q", "-e", "-8", "-cv", "-o", outDir, pstFile], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(stderr.trim() || `readpst endete mit ${code}`);
};

/** All items below `outDir`, in a stable order (folder, then number). */
export const listItems = async (outDir: string): Promise<PstItem[]> => {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .flatMap((entry): PstItem[] => {
      const kind = KINDS[entry.name.split(".").pop()?.toLowerCase() ?? ""];
      if (!kind) return [];
      const file = join(entry.parentPath, entry.name);
      const folder = relative(outDir, entry.parentPath).split(sep).filter(Boolean);
      return [{ kind, folder, file }];
    })
    .sort(
      (a, b) =>
        a.folder.join("/").localeCompare(b.folder.join("/")) ||
        a.file.localeCompare(b.file, undefined, { numeric: true }),
    );
};
