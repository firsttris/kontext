/** Finding or creating the folder a moved mail goes into. */
import type { TargetFolder } from "./folders";
import type { Folder, Importer } from "./importer";

/** Names for a special folder the account does not have yet (Stalwart creates no archive). */
const ROLE_NAMES: Record<string, string> = {
  archive: "Archiv",
  sent: "Gesendet",
  drafts: "Entwürfe",
};

/** Finds or creates the folder for a target, level by level. */
export const folderResolver = (importer: Importer, accountId: string, existing: Folder[]) => {
  const known = [...existing];
  const cache = new Map<string, string>();
  /**
   * The folder of that name under a parent. Stalwart refuses a sibling whose name differs only
   * in case (crates/jmap/src/mailbox/set.rs, "Verify that the mailbox name is unique"), so the
   * names are compared lower-cased and such a folder is reused instead of created.
   */
  const child = (parentId: string | null, name: string) =>
    known.find((f) => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase());
  /** The account lacks this special folder: a top-level one of that name, else a new one. */
  const specialFolder = async (role: string): Promise<string> => {
    const name = ROLE_NAMES[role] ?? "Import";
    const found = child(null, name);
    if (found) return found.id;
    const id = await importer.createFolder(accountId, name, null, ROLE_NAMES[role] ? role : null);
    known.push({ id, name, parentId: null, role });
    return id;
  };
  return async (target: TargetFolder): Promise<string> => {
    const key = `${target.role ?? ""}|${target.path.join("/")}`;
    const cached = cache.get(key);
    if (cached) return cached;
    // A role the account lacks (e.g. no archive yet) gets its folder first, so a path below it
    // ("Archiv/2020" from a PST whose "Archiv" holds only subfolders) lands there, not at the top.
    let parentId = target.role
      ? (known.find((f) => f.role === target.role)?.id ?? (await specialFolder(target.role)))
      : null;
    for (const name of target.path) {
      const found = child(parentId, name);
      const id = found?.id ?? (await importer.createFolder(accountId, name, parentId));
      if (!found) known.push({ id, name, parentId, role: null });
      parentId = id;
    }
    const id = parentId ?? (await specialFolder(""));
    cache.set(key, id);
    return id;
  };
};
