/**
 * Sharing an address book or a calendar with colleagues: the choices the app offers (calendars
 * have one more, their free and busy times only) and the JMAP rights behind them (`shareWith`, draft-ietf-jmap-contacts and -calendars).
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

/** "availability": a calendar's free and busy times only, without titles (`mayReadFreeBusy`). */
export type Access = "none" | "availability" | "read" | "edit";

/** The choices per kind; only calendars have free and busy times. */
export const ACCESS: Record<ShareKind, Access[]> = {
  addressBook: ["none", "read", "edit"],
  calendar: ["none", "availability", "read", "edit"],
};

export const accessOf = (rights: Rights | null | undefined): Access =>
  rights?.mayWrite || rights?.mayWriteAll
    ? "edit"
    : rights?.mayRead || rights?.mayReadItems
      ? "read"
      : rights?.mayReadFreeBusy
        ? "availability"
        : "none";

const RIGHTS: Record<ShareKind, Partial<Record<Exclude<Access, "none">, Rights>>> = {
  addressBook: {
    read: { mayRead: true, mayWrite: false, mayDelete: false, mayShare: false },
    edit: { mayRead: true, mayWrite: true, mayDelete: true, mayShare: false },
  },
  calendar: {
    availability: {
      mayReadFreeBusy: true,
      mayReadItems: false,
      mayWriteAll: false,
      mayWriteOwn: false,
      mayUpdatePrivate: false,
      mayRSVP: false,
      mayDelete: false,
      mayShare: false,
    },
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
  access === "none" ? null : (RIGHTS[kind][access] ?? null);

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

/** The principals an item is shared with (read or more; free and busy times alone do not count). */
export const sharedWith = (shareWith: ShareWith | null | undefined): string[] =>
  Object.entries(shareWith ?? {})
    .filter(([, rights]) => ["read", "edit"].includes(accessOf(rights)))
    .map(([id]) => id);

/**
 * What all colleagues see of a calendar at least: "availability" when every one of them may read
 * its free and busy times (the company default, like Outlook's), else "none".
 */
export const everyoneAccess = (
  shareWith: ShareWith | null | undefined,
  people: string[],
): "none" | "availability" =>
  people.length > 0 && people.every((id) => accessOf(shareWith?.[id]) !== "none")
    ? "availability"
    : "none";

/**
 * The calendar's `shareWith` after choosing what all colleagues see: "availability" adds free and
 * busy times for whoever has nothing; "none" takes back those who have only that. Colleagues
 * with read or edit access keep it.
 */
export const withEveryone = (
  current: ShareWith | null | undefined,
  people: string[],
  access: "none" | "availability",
): ShareWith =>
  nextShareWith(
    current,
    Object.fromEntries(
      people
        .filter((id) =>
          access === "availability"
            ? accessOf(current?.[id]) === "none"
            : accessOf(current?.[id]) === "availability",
        )
        .map((id) => [id, access]),
    ),
    "calendar",
  );
