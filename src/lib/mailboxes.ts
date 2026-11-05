/** Pure helpers for mailboxes: German names for the standard folders and the folder tree. */
import type { Mailbox } from "@/jmap/types";
import { m } from "@/paraglide/messages";

/** The order of the standard folders in the sidebar, by JMAP role. */
export const ROLE_ORDER = [
  "inbox",
  "flagged",
  "snoozed",
  "drafts",
  "sent",
  "archive",
  "junk",
  "trash",
] as const;
export type MailboxRole = (typeof ROLE_ORDER)[number];

const roleNames: Record<MailboxRole, () => string> = {
  inbox: m.mail_inbox,
  flagged: m.mail_flagged,
  snoozed: m.mail_snoozed,
  drafts: m.mail_drafts,
  sent: m.mail_sent,
  archive: m.mail_archive,
  junk: m.mail_junk,
  trash: m.mail_trash,
};

/** Stalwart names the standard folders in English; the app shows them in German by role. */
export const mailboxName = (mailbox: Pick<Mailbox, "name" | "role">): string => {
  const role = mailbox.role as MailboxRole | null;
  return role && role in roleNames ? roleNames[role]() : mailbox.name;
};

export const isSystemMailbox = (mailbox: Pick<Mailbox, "role">): boolean =>
  mailbox.role !== null && (ROLE_ORDER as readonly string[]).includes(mailbox.role);

export const systemMailboxes = (mailboxes: Mailbox[]): Mailbox[] =>
  mailboxes
    .filter(isSystemMailbox)
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role as MailboxRole) - ROLE_ORDER.indexOf(b.role as MailboxRole),
    );

export type FolderNode = { mailbox: Mailbox; depth: number; children: FolderNode[] };

const byOrderThenName = (a: Mailbox, b: Mailbox): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de");

/** The user's own folders as a tree, standard folders excluded. */
export const folderTree = (mailboxes: Mailbox[]): FolderNode[] => {
  const own = mailboxes.filter((mailbox) => !isSystemMailbox(mailbox));
  const ids = new Set(own.map((mailbox) => mailbox.id));
  const build = (parentId: string | null, depth: number): FolderNode[] =>
    own
      .filter((mailbox) =>
        parentId === null
          ? mailbox.parentId === null || !ids.has(mailbox.parentId)
          : mailbox.parentId === parentId,
      )
      .sort(byOrderThenName)
      .map((mailbox) => ({ mailbox, depth, children: build(mailbox.id, depth + 1) }));
  return build(null, 0);
};

/** Depth-first list of a tree, for menus such as "move to". */
export const flattenTree = (nodes: FolderNode[]): FolderNode[] =>
  nodes.flatMap((node) => [node, ...flattenTree(node.children)]);

/** Full path like "Kunden / Hoffmann", for menus where the tree is not visible. */
export const mailboxPath = (mailbox: Mailbox, mailboxes: Mailbox[]): string => {
  const parts: string[] = [];
  let current: Mailbox | undefined = mailbox;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(mailboxName(current));
    const parentId: string | null = current.parentId;
    current = parentId ? mailboxes.find((candidate) => candidate.id === parentId) : undefined;
  }
  return parts.join(" / ");
};

export const findRole = (mailboxes: Mailbox[], role: MailboxRole): Mailbox | undefined =>
  mailboxes.find((mailbox) => mailbox.role === role);

/**
 * What the toolbar offers for mails in a mailbox. Members of a shared mailbox may do everything;
 * a mailbox shared only for reading allows reading (and, if granted, marking read).
 * Unknown rights count as allowed, the server checks anyway.
 */
export const mailboxRights = (mailbox: Mailbox) => ({
  canRemove: mailbox.myRights?.mayRemoveItems !== false,
  canMarkSeen: mailbox.myRights?.maySetSeen !== false,
  canFlag: mailbox.myRights?.maySetKeywords !== false,
});

/**
 * Whether mails here can be assigned (src/lib/assignment.ts). Stalwart writes shared metadata
 * only with `maySetMetadata` (Acl::ModifyMetadata, crates/jmap-proto/src/object/mailbox.rs);
 * "Nur lesen" grants `maySetKeywords` but not this.
 */
export const canAssignIn = (mailbox: Mailbox) => mailbox.myRights?.maySetMetadata !== false;

/** A folder's subfolders at every depth, each parent before its children. */
export const subfolders = (mailbox: Pick<Mailbox, "id">, mailboxes: Mailbox[]): Mailbox[] =>
  mailboxes
    .filter((candidate) => candidate.parentId === mailbox.id)
    .flatMap((child) => [child, ...subfolders(child, mailboxes)]);

/**
 * What a folder's menu in the sidebar offers. Standard folders keep their name and place
 * (Stalwart also refuses to delete Posteingang, Spam and Papierkorb); in a shared mailbox the
 * rights decide (RFC 8621 §2, `myRights`): `mayRename` covers moving, too. Marking read needs
 * unread mails and `maySetSeen`; exporting as .mbox needs mails (seeing the folder is reading them).
 */
export const folderActions = (mailbox: Mailbox, mailboxes: Mailbox[] = []) => {
  const own = mailbox.role === null;
  // Deleting takes the subfolders along: never a standard folder such as the Papierkorb.
  const holdsStandard = subfolders(mailbox, mailboxes).some((child) => child.role !== null);
  return {
    rename: own && mailbox.myRights?.mayRename !== false,
    remove: own && !holdsStandard && mailbox.myRights?.mayDelete !== false,
    markRead: mailbox.unreadEmails > 0 && mailboxRights(mailbox).canMarkSeen,
    exportMbox: mailbox.totalEmails > 0,
  };
};

/**
 * Where a folder can go: any own folder except itself and its subfolders (RFC 8621 §2: no loops)
 * that takes subfolders (`mayCreateChild`). The top level is always offered besides. The current
 * parent stays in the list even when it is no target (a standard folder such as the Posteingang,
 * or one without `mayCreateChild`), first if it is not in the tree: otherwise the select would
 * show "—" for a folder that is not at the top level, and "—" could not be picked.
 */
export const moveTargets = (mailbox: Mailbox, mailboxes: Mailbox[]): FolderNode[] => {
  const excluded = new Set([mailbox, ...subfolders(mailbox, mailboxes)].map((box) => box.id));
  const targets = flattenTree(folderTree(mailboxes)).filter(
    (node) =>
      !excluded.has(node.mailbox.id) &&
      (node.mailbox.myRights?.mayCreateChild !== false || node.mailbox.id === mailbox.parentId),
  );
  const parent = mailboxes.find((box) => box.id === mailbox.parentId);
  return parent && !targets.some((node) => node.mailbox.id === parent.id)
    ? [{ mailbox: parent, depth: 0, children: [] }, ...targets]
    : targets;
};
