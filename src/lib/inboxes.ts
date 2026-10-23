/** Lists over several accounts ("Alle Posteingänge", search): merging their paged lists. */
import type { Account, EmailSummary, Mailbox } from "@/jmap/types";

/** A row of the combined list; `label` is empty for the own account (no badge). */
export type MergedRow = { email: EmailSummary; account: { id: string; label: string } };

export type Feed = {
  emails: EmailSummary[];
  pending: boolean;
  hasMore: boolean;
  fetching: boolean;
  fetchMore: () => void;
  /** All matches on the server. */
  total: number;
};

export type Inbox = { account: Account; mailbox: Mailbox };

/** Shared mailboxes are labelled by their address ("info@"), the own one is not labelled. */
const label = (account: Account) => (account.isPersonal ? "" : account.name.replace(/@.*/, "@"));

/**
 * The merged rows. While an account has older mails still to load, nothing older than its oldest
 * loaded mail is shown, so the order stays right as pages come in.
 */
export const mergeFeeds = (
  inboxes: { account: Account }[],
  feeds: Record<string, Feed | undefined>,
): MergedRow[] => {
  const cutoff = Math.max(
    ...inboxes
      .map(({ account }) => feeds[account.id])
      .filter((feed): feed is Feed => Boolean(feed?.hasMore && feed.emails.length))
      .map((feed) => Date.parse(feed.emails.at(-1)!.receivedAt)),
    Number.NEGATIVE_INFINITY,
  );
  return inboxes
    .flatMap(({ account }) =>
      (feeds[account.id]?.emails ?? []).map((email) => ({
        email,
        account: { id: account.id, label: label(account) },
      })),
    )
    .filter((row) => Date.parse(row.email.receivedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.email.receivedAt) - Date.parse(a.email.receivedAt));
};
