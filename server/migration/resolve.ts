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
  /** The account lacks this special folder: a top-level one of that name, else a new one. */
  const specialFolder = async (role: string): Promise<string> => {
    const name = ROLE_NAMES[role] ?? "Import";
    const found = known.find((f) => f.name === name && f.parentId === null);
    if (found) return found.id;
    const id = await importer.createFolder(accountId, name, null, ROLE_NAMES[role] ? role : null);
    known.push({ id, name, parentId: null, role });
    return id;
  };
  return async (target: TargetFolder): Promise<string> => {
    const key = `${target.role ?? ""}|${target.path.join("/")}`;
    const cached = cache.get(key);
    if (cached) return cached;
    let parentId = target.role ? (known.find((f) => f.role === target.role)?.id ?? null) : null;
    for (const name of target.path) {
      const found = known.find((f) => f.name === name && f.parentId === parentId);
      const id = found?.id ?? (await importer.createFolder(accountId, name, parentId));
      if (!found) known.push({ id, name, parentId, role: null });
      parentId = id;
    }
    // A role the account lacks (e.g. no archive yet) becomes a folder of that name.
    const id = parentId ?? (await specialFolder(target.role ?? ""));
    cache.set(key, id);
    return id;
  };
};
