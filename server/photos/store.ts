/**
 * Profile photos on disk, one `<accountId>.jpg` in a directory next to the database (so the backup
 * of the data directory has them). The file's time is the photo's version: the app puts it in the
 * URL, so a browser may keep a photo for good and still sees a new one at once.
 */
import { mkdirSync } from "node:fs";
import { access, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAccountId } from "./photo";

export type PhotoStore = {
  /** Every photo's account id with its version. */
  list: () => Promise<Record<string, number>>;
  /** The photo's bytes, or null without one. */
  read: (accountId: string) => Promise<Uint8Array | null>;
  /** Returns the new version. */
  save: (accountId: string, bytes: Uint8Array) => Promise<number>;
  remove: (accountId: string) => Promise<void>;
};

export const createPhotoStore = (dir: string): PhotoStore => {
  mkdirSync(dir, { recursive: true });
  const fileOf = (accountId: string) => join(dir, `${accountId}.jpg`);
  const versionOf = async (path: string) => Math.floor((await stat(path)).mtimeMs);

  return {
    list: async () => {
      const entries = await Promise.all(
        (await readdir(dir))
          .filter((name) => name.endsWith(".jpg") && isAccountId(name.slice(0, -4)))
          .map(async (name) => [name.slice(0, -4), await versionOf(join(dir, name))] as const),
      );
      return Object.fromEntries(entries);
    },
    read: async (accountId) => {
      if (!isAccountId(accountId)) return null;
      const path = fileOf(accountId);
      const found = await access(path).then(
        () => true,
        () => false,
      );
      return found ? new Uint8Array(await readFile(path)) : null;
    },
    save: async (accountId, bytes) => {
      if (!isAccountId(accountId)) throw new Error("Kein gültiges Konto.");
      await writeFile(fileOf(accountId), bytes);
      return versionOf(fileOf(accountId));
    },
    remove: async (accountId) => {
      if (isAccountId(accountId)) await rm(fileOf(accountId), { force: true });
    },
  };
};
