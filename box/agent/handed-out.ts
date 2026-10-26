/**
 * Which desk phone passwords the box has handed out. Anyone in the office network can ask for
 * /snom/<mac>.xml, and a MAC is printed on the phone and seen in the network: so each password
 * goes out once, to the first fetch after the phone was added in Kontext. Later fetches (a phone
 * restarting) get the settings without it, and the phone keeps the one it has. A new password (the
 * phone added again) goes out once again. Kept as hashes in the box's data.
 */
import { createHash } from "node:crypto";

export type HandedOutStore = {
  load: () => Promise<string[]>;
  save: (keys: string[]) => Promise<void>;
};

const keyOf = (mac: string, password: string) =>
  createHash("sha256").update(`${mac}:${password}`).digest("hex");

export const createHandedOut = (store: HandedOutStore) => {
  let known: Promise<Set<string>> | null = null;
  /** True the first time this phone asks with this password, false after. */
  return async (mac: string, password: string): Promise<boolean> => {
    known ??= store.load().then((keys) => new Set(keys));
    const keys = await known;
    const key = keyOf(mac, password);
    if (keys.has(key)) return false;
    keys.add(key);
    await store.save([...keys]);
    return true;
  };
};
