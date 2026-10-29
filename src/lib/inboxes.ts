/** Lists over several accounts ("Alle Posteingänge", search): merging their paged lists. */
import type { EmailSummary, Mailbox } from "@/jmap/types";
import { type MailAccount, mailboxNotice } from "./mail-accounts";
import { compareMails, DEFAULT_SORT, type MailSort } from "./mail-sort";

/** A row of the combined list; `label` is empty for the own account (no badge). */
export type MergedRow = {
  email: EmailSummary;
  account: { id: string; label: string; title?: string };
};

export type Feed = {
  emails: EmailSummary[];
  pending: boolean;
  hasMore: boolean;
  fetching: boolean;
  fetchMore: () => void;
  /** All matches on the server. */
  total: number;
};

export type Inbox = { account: MailAccount; mailbox: Mailbox };

/** Shared mailboxes are labelled by their full address, the own one is not labelled. */
const label = (account: MailAccount) => (account.isPersonal ? "" : account.name);

const rowsOf = (account: MailAccount, emails: EmailSummary[]): MergedRow[] =>
  emails.map((email) => ({
    email,
    account: { id: account.id, label: label(account), title: mailboxNotice(account) },
  }));

/**
 * The merged rows, in the list's order: each account's list is already in it (the server sorted
 * it), so they are merged, not re-sorted. While an account has more mails still to load, the
 * merge stops where its loaded ones end: what comes next may belong before anything later.
 */
export const mergeFeeds = (
  inboxes: { account: MailAccount }[],
  feeds: Record<string, Feed | undefined>,
  sort: MailSort = DEFAULT_SORT,
  categoriesOf: (accountId: string) => string[] = () => [],
): MergedRow[] => {
  const compare = compareMails(sort);
  const item = (row: MergedRow) => ({ email: row.email, categories: categoriesOf(row.account.id) });
  const lanes = inboxes.map(({ account }) => {
    const feed = feeds[account.id];
    return {
      rows: rowsOf(account, feed?.emails ?? []),
      blocking: Boolean(feed?.hasMore && feed.emails.length),
    };
  });
  const heads = lanes.map(() => 0);
  const headOf = (index: number) => lanes[index]!.rows[heads[index]!];
  const merged: MergedRow[] = [];
  for (;;) {
    const open = lanes.map((_, index) => index).filter((index) => headOf(index));
    const waiting = lanes.some((lane, index) => lane.blocking && !headOf(index));
    if (open.length === 0 || waiting) return merged;
    const pick = open.reduce((best, index) =>
      compare(item(headOf(index)!), item(headOf(best)!)) < 0 ? index : best,
    );
    merged.push(headOf(pick)!);
    heads[pick] = heads[pick]! + 1;
  }
};

/** What came back from Wiedervorlage into an inbox and is not read yet (server/snooze/snooze.ts). */
export const resurfacedFilter = (mailboxId: string, keyword: string) => ({
  search: {
    operator: "AND",
    conditions: [{ inMailbox: mailboxId }, { hasKeyword: keyword }, { notKeyword: "$seen" }],
  },
});

type Sectioned = { email: EmailSummary; section?: string };

/**
 * The mails back from Wiedervorlage on top, under their own heading, and the rest below under
 * another; a mail on top is not listed twice. Without any back, the list stays as it is.
 */
export const pinResurfaced = <R extends Sectioned>(
  back: R[],
  listed: R[],
  headings: { back: string; rest: string },
): R[] => {
  if (!back.length) return listed;
  const ids = new Set(back.map((row) => row.email.id));
  const rest = listed.filter((row) => !ids.has(row.email.id));
  return [
    ...back.map((row, index) => (index === 0 ? { ...row, section: headings.back } : row)),
    ...rest.map((row, index) => (index === 0 ? { ...row, section: headings.rest } : row)),
  ];
};
