/**
 * Sharing an address book (or calendar) with colleagues: the three choices the app offers and the
 * JMAP rights behind them (`shareWith`, draft-ietf-jmap-contacts §2 / -calendars §4).
 *
 * Stalwart maps `mayWrite` to adding and changing entries only; removing them needs `mayDelete`
 * (crates/jmap-proto/src/object/addressbook.rs, `JmapRight for AddressBookRight`). So "Bearbeiten"
 * grants both. Sharing on stays with the owner.
 */

export type Rights = {
  mayRead?: boolean;
  mayWrite?: boolean;
  mayDelete?: boolean;
  mayShare?: boolean;
};

export type ShareWith = Record<string, Rights>;

export type Access = "none" | "read" | "edit";

export const ACCESS: Access[] = ["none", "read", "edit"];

export const accessOf = (rights: Rights | null | undefined): Access =>
  rights?.mayWrite ? "edit" : rights?.mayRead ? "read" : "none";

export const rightsFor = (access: Access): Rights | null =>
  access === "edit"
    ? { mayRead: true, mayWrite: true, mayDelete: true, mayShare: false }
    : access === "read"
      ? { mayRead: true, mayWrite: false, mayDelete: false, mayShare: false }
      : null;

/** The new `shareWith` after choosing an access per principal; "none" removes the entry. */
export const nextShareWith = (
  current: ShareWith | null | undefined,
  changes: Record<string, Access>,
): ShareWith => {
  const next: ShareWith = { ...(current ?? {}) };
  for (const [principalId, access] of Object.entries(changes)) {
    const rights = rightsFor(access);
    if (rights) next[principalId] = rights;
    else delete next[principalId];
  }
  return next;
};

/** The principals an item is shared with (read or more). */
export const sharedWith = (shareWith: ShareWith | null | undefined): string[] =>
  Object.entries(shareWith ?? {})
    .filter(([, rights]) => accessOf(rights) !== "none")
    .map(([id]) => id);
