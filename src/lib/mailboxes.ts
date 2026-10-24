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
