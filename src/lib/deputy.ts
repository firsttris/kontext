/**
 * A deputy in one step: give a colleague the own mailbox, calendars and address books at once,
 * see who has access to what, and take it all back at once. Pure functions over the objects'
 * `shareWith` (draft-ietf-jmap-sharing; RFC 8621 §2 for mailboxes, draft-ietf-jmap-calendars and
 * -contacts for the others); src/jmap/deputy.ts loads and writes them.
 *
 * Revoking takes back everything the person can read or change in the three, whether it came
 * from here or from a calendar's or address book's share dialog: the overview shows both, and a
 * button that left some of it behind would promise more than it does. Only a calendar's free and
 * busy times stay when every other colleague sees them too (the company default, see
 * `everyoneAccess`), so the deputy is not left knowing less than everyone else.
 */
import { type Access, accessOf, everyoneAccess, rightsFor } from "./sharing";

export type DeputyKind = "mailbox" | "calendar" | "addressBook";

export type DeputyLevel = "read" | "edit";

export const DEPUTY_KINDS: DeputyKind[] = ["mailbox", "calendar", "addressBook"];

export type Rights = Partial<Record<string, boolean>>;

/** A mailbox (folder), calendar or address book of the own account with whom it is shared. */
export type Shared = { id: string; shareWith?: Record<string, Rights> | null };

export type DeputyObjects = Record<DeputyKind, Shared[]>;

/** Per kind and object id: the `shareWith/<principal>` patch for `…/set` (null removes). */
export type DeputyPatches = Record<DeputyKind, Record<string, Record<string, Rights | null>>>;

/**
 * Mailbox rights per level. "Lesen" as the Firmenverwaltung's "Nur lesen" (server/company/
 * sharing.ts): read and mark as read. "Bearbeiten" also files, flags and deletes mails; folders
 * stay the owner's (no creating, renaming or deleting them) and sending stays with members of
 * the account, Stalwart gives identities only to them (crates/jmap-proto/src/object/mailbox.rs,
 * `MailboxRight::to_acl`).
 */
const MAILBOX_RIGHTS: Record<DeputyLevel, Rights> = {
  read: {
    mayReadItems: true,
    mayAddItems: false,
    mayRemoveItems: false,
    maySetSeen: true,
    maySetKeywords: false,
    mayCreateChild: false,
    mayRename: false,
    maySubmit: false,
    mayDelete: false,
    mayShare: false,
  },
  edit: {
    mayReadItems: true,
    mayAddItems: true,
    mayRemoveItems: true,
    maySetSeen: true,
    maySetKeywords: true,
    mayCreateChild: false,
    mayRename: false,
    maySubmit: false,
    mayDelete: false,
    mayShare: false,
  },
};

export const deputyRights = (kind: DeputyKind, level: DeputyLevel): Rights =>
  kind === "mailbox" ? MAILBOX_RIGHTS[level] : rightsFor(level, kind)!;

/** What a person may do with one object, in the share dialog's terms. */
export const accessIn = (kind: DeputyKind, rights: Rights | null | undefined): Access =>
  kind !== "mailbox"
    ? accessOf(rights)
    : rights?.mayAddItems || rights?.mayRemoveItems
      ? "edit"
      : rights?.mayReadItems
        ? "read"
        : "none";

const isDeputyAccess = (access: Access): access is DeputyLevel =>
  access === "read" || access === "edit";

const emptyPatches = (): DeputyPatches => ({ mailbox: {}, calendar: {}, addressBook: {} });

const sameRights = (a: Rights | null | undefined, b: Rights): boolean =>
  Object.entries(b).every(([right, value]) => Boolean(a?.[right]) === value);

/**
 * Patches that give `principalId` exactly `level` on every object of the chosen kinds. Objects
 * that already have exactly these rights stay untouched; a higher level from before is lowered,
 * so the overview afterwards says what was chosen.
 */
export const grantPatches = (
  objects: DeputyObjects,
  principalId: string,
  level: DeputyLevel,
  kinds: DeputyKind[],
): DeputyPatches => {
  const patches = emptyPatches();
  for (const kind of kinds) {
    const rights = deputyRights(kind, level);
    for (const object of objects[kind]) {
      if (!sameRights(object.shareWith?.[principalId], rights)) {
        patches[kind][object.id] = { [`shareWith/${principalId}`]: rights };
      }
    }
  }
  return patches;
};

/**
 * Patches that take back all read and edit access of `principalId` (see the file comment). A
 * calendar falls back to free and busy times only when all `colleagues` but this one see them.
 */
export const revokePatches = (
  objects: DeputyObjects,
  principalId: string,
  colleagues: string[],
): DeputyPatches => {
  const patches = emptyPatches();
  const others = colleagues.filter((id) => id !== principalId);
  for (const kind of DEPUTY_KINDS) {
    for (const object of objects[kind]) {
      if (!isDeputyAccess(accessIn(kind, object.shareWith?.[principalId]))) continue;
      const keepAvailability =
        kind === "calendar" && everyoneAccess(object.shareWith, others) === "availability";
      patches[kind][object.id] = {
        [`shareWith/${principalId}`]: keepAvailability ? rightsFor("availability", kind) : null,
      };
    }
  }
  return patches;
};

export const hasPatches = (patches: DeputyPatches): boolean =>
  DEPUTY_KINDS.some((kind) => Object.keys(patches[kind]).length > 0);

/** One kind for one person: the highest level, on how many of how many objects. */
export type KindAccess = { level: DeputyLevel; count: number; total: number };

export type DeputyEntry = {
  principalId: string;
  kinds: Partial<Record<DeputyKind, KindAccess>>;
};

const kindAccess = (
  kind: DeputyKind,
  objects: Shared[],
  principalId: string,
): KindAccess | undefined => {
  const levels = objects
    .map((object) => accessIn(kind, object.shareWith?.[principalId]))
    .filter(isDeputyAccess);
  if (levels.length === 0) return undefined;
  const level = levels.includes("edit") ? "edit" : "read";
  return { level, count: levels.length, total: objects.length };
};

/**
 * Who can read or change anything of the three, and what. Free and busy times alone do not
 * count: by default every colleague sees them.
 */
export const deputyOverview = (objects: DeputyObjects): DeputyEntry[] => {
  const people = new Set(
    DEPUTY_KINDS.flatMap((kind) =>
      objects[kind].flatMap((object) => Object.keys(object.shareWith ?? {})),
    ),
  );
  return [...people]
    .map((principalId) => ({
      principalId,
      kinds: Object.fromEntries(
        DEPUTY_KINDS.flatMap((kind) => {
          const access = kindAccess(kind, objects[kind], principalId);
          return access ? [[kind, access]] : [];
        }),
      ),
    }))
    .filter((entry) => Object.keys(entry.kinds).length > 0);
};
