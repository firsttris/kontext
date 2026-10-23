/**
 * Sharing an address book or a calendar with colleagues: the three choices the app offers and
 * the JMAP rights behind them (`shareWith`, draft-ietf-jmap-contacts and -calendars).
 *
 * Stalwart's mapping to its ACLs decides the sets (crates/jmap-proto/src/object/addressbook.rs and
 * calendar.rs, `JmapRight::to_acl`): for address books `mayWrite` only adds and changes entries,
 * removing them needs `mayDelete`, so "Bearbeiten" grants both; for calendars `mayWriteAll`
 * already includes removing events. Sharing further stays with the owner.
 */

export type Rights = {
  // Address books
  mayRead?: boolean;
  mayWrite?: boolean;
  // Calendars
  mayReadFreeBusy?: boolean;
  mayReadItems?: boolean;
  mayWriteAll?: boolean;
  mayWriteOwn?: boolean;
  mayUpdatePrivate?: boolean;
  mayRSVP?: boolean;
  // Both
  mayDelete?: boolean;
  mayShare?: boolean;
};

export type ShareWith = Record<string, Rights>;

export type ShareKind = "addressBook" | "calendar";

export type Access = "none" | "read" | "edit";

export const ACCESS: Access[] = ["none", "read", "edit"];

export const accessOf = (rights: Rights | null | undefined): Access =>
  rights?.mayWrite || rights?.mayWriteAll
    ? "edit"
    : rights?.mayRead || rights?.mayReadItems
      ? "read"
      : "none";

const RIGHTS: Record<ShareKind, Record<Exclude<Access, "none">, Rights>> = {
  addressBook: {
    read: { mayRead: true, mayWrite: false, mayDelete: false, mayShare: false },
    edit: { mayRead: true, mayWrite: true, mayDelete: true, mayShare: false },
  },
  calendar: {
    read: {
      mayReadFreeBusy: true,
      mayReadItems: true,
      mayWriteAll: false,
      mayWriteOwn: false,
      mayUpdatePrivate: false,
      mayRSVP: false,
      mayDelete: false,
      mayShare: false,
    },
    edit: {
      mayReadFreeBusy: true,
      mayReadItems: true,
      mayWriteAll: true,
      mayWriteOwn: true,
      mayUpdatePrivate: true,
      mayRSVP: true,
      mayDelete: false,
      mayShare: false,
    },
  },
};

export const rightsFor = (access: Access, kind: ShareKind): Rights | null =>
  access === "none" ? null : RIGHTS[kind][access];

/** The new `shareWith` after choosing an access per principal; "none" removes the entry. */
export const nextShareWith = (
  current: ShareWith | null | undefined,
  changes: Record<string, Access>,
  kind: ShareKind,
): ShareWith => {
  const next: ShareWith = { ...(current ?? {}) };
  for (const [principalId, access] of Object.entries(changes)) {
    const rights = rightsFor(access, kind);
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
