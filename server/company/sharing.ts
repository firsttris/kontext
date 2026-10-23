/**
 * "Nur lesen" for shared mailboxes and handing over a mailbox: folders shared per person with
 * `shareWith` (RFC 8621 §2 with draft-ietf-jmap-sharing rights). Pure functions.
 */

export type MailboxRights = Partial<Record<string, boolean>>;
export type Folder = {
  id: string;
  role: string | null;
  shareWith: Record<string, MailboxRights> | null;
};

/** Read and mark as read; no moving, deleting or sending (Stalwart adds `maySetKeywords`). */
export const READ_ONLY: MailboxRights = { mayReadItems: true, maySetSeen: true };

/** Everything but sharing on: for taking over a former colleague's mailbox. */
export const FULL_ACCESS: MailboxRights = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

/** Who can read the account's inbox through `shareWith`. */
export const readersOf = (folders: Folder[]): string[] => {
  const inbox = folders.find((folder) => folder.role === "inbox");
  return Object.entries(inbox?.shareWith ?? {})
    .filter(([, rights]) => rights.mayReadItems)
    .map(([id]) => id);
};

/**
 * Patches so that exactly `wanted` read every folder with `rights`: new people are added, people
 * no longer wanted are removed, the rest stays as it is.
 */
export const sharePatches = (
  folders: Folder[],
  wanted: string[],
  rights: MailboxRights,
  previous: string[] = readersOf(folders),
): Record<string, Record<string, MailboxRights | null>> => {
  const patches: Record<string, Record<string, MailboxRights | null>> = {};
  for (const folder of folders) {
    const patch: Record<string, MailboxRights | null> = {};
    for (const id of wanted) {
      if (!folder.shareWith?.[id]?.mayReadItems) patch[`shareWith/${id}`] = rights;
    }
    for (const id of previous) {
      if (!wanted.includes(id) && folder.shareWith?.[id]) patch[`shareWith/${id}`] = null;
    }
    if (Object.keys(patch).length) patches[folder.id] = patch;
  }
  return patches;
};
