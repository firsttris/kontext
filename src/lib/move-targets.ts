/**
 * Where a mail can be moved: the folders of its own mailbox first, then those of the other
 * mailboxes (own account, shared ones like info@). A move within a mailbox changes the mail's
 * folder; a move into another mailbox is a copy there and a delete here (mail.ts, copyEmails).
 */
import type { Account, Mailbox } from "@/jmap/types";
import { flattenTree, folderTree, mailboxPath, systemMailboxes } from "./mailboxes";

export type MoveTarget = { accountId: string; mailbox: Mailbox; label: string };
export type MoveGroup = { account: Account; targets: MoveTarget[] };

/** Drafts and "Markiert" are no places to put a mail; "Wiedervorlage" wants a time. */
const isDestination = (mailbox: Mailbox): boolean =>
  mailbox.role !== "drafts" &&
  mailbox.role !== "flagged" &&
  mailbox.role !== "snoozed" &&
  mailbox.myRights?.mayAddItems !== false;

const targetsOf = (accountId: string, mailboxes: Mailbox[]): MoveTarget[] =>
  [...systemMailboxes(mailboxes), ...flattenTree(folderTree(mailboxes)).map((node) => node.mailbox)]
    .filter(isDestination)
    .map((mailbox) => ({ accountId, mailbox, label: mailboxPath(mailbox, mailboxes) }));

export const moveTargets = (
  accounts: Account[],
  mailboxesByAccount: Record<string, Mailbox[] | undefined>,
  from: { accountId: string; mailboxId: string },
): MoveGroup[] =>
  [...accounts]
    .sort((a, b) => Number(b.id === from.accountId) - Number(a.id === from.accountId))
    .map((account) => ({
      account,
      targets: targetsOf(account.id, mailboxesByAccount[account.id] ?? []).filter(
        (target) => !(target.accountId === from.accountId && target.mailbox.id === from.mailboxId),
      ),
    }))
    .filter((group) => group.targets.length > 0);
