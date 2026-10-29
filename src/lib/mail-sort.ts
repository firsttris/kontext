/**
 * The order of the mail list: the choices, the JMAP sort for each (RFC 8621 §4.4.2) and the same
 * order on the client, for lists merged over several accounts. Pure.
 *
 * Stalwart 0.16.27 sorts by receivedAt, size, from, to, subject, sentAt, hasKeyword,
 * allInThreadHaveKeyword and someInThreadHaveKeyword (crates/jmap/src/email/query.rs); a keyword
 * comparator ranks the mails without it first when ascending (crates/store/src/search/local.rs).
 */
import type { EmailSummary } from "@/jmap/types";
import { displayName } from "./format";

export const MAIL_SORTS = [
  "newest",
  "oldest",
  "unread",
  "flagged",
  "category",
  "from",
  "subject",
  "size",
] as const;
export type MailSort = (typeof MAIL_SORTS)[number];

export const DEFAULT_SORT: MailSort = "newest";

/** A stored choice, or the default for anything else (an old value, nothing, garbage). */
export const readMailSort = (stored: string | null | undefined): MailSort =>
  (MAIL_SORTS as readonly string[]).includes(stored ?? "") ? (stored as MailSort) : DEFAULT_SORT;

export type Comparator = { property: string; isAscending: boolean; keyword?: string };

type SortOptions = {
  /** One line per conversation (collapseThreads): the keyword decides for the whole conversation. */
  threads?: boolean;
  /** The category keywords of the account, in its order. */
  categories?: string[];
};

const NEWEST: Comparator = { property: "receivedAt", isAscending: false };

/**
 * A keyword first (or last, `ascending`). In a conversation any mail with it counts – for unread
 * the other way round: a conversation counts as read only when all its mails are – so the line
 * lands where one of its mails belongs and shows the newest (RFC 8621 §4.4.2).
 */
const byKeyword = (
  keyword: string,
  { first, threads }: { first: boolean; threads: boolean },
): Comparator => {
  const property = !threads
    ? "hasKeyword"
    : first
      ? "someInThreadHaveKeyword"
      : "allInThreadHaveKeyword";
  return { property, keyword, isAscending: !first };
};

/** The `sort` of Email/query for a choice; ties are broken by the newest first. */
export const sortComparators = (
  sort: MailSort,
  { threads = false, categories = [] }: SortOptions = {},
): Comparator[] => {
  switch (sort) {
    case "newest":
      return [NEWEST];
    case "oldest":
      return [{ property: "receivedAt", isAscending: true }];
    case "unread":
      return [byKeyword("$seen", { first: false, threads }), NEWEST];
    case "flagged":
      return [byKeyword("$flagged", { first: true, threads }), NEWEST];
    case "category":
      return [...categories.map((keyword) => byKeyword(keyword, { first: true, threads })), NEWEST];
    case "from":
      return [{ property: "from", isAscending: true }, NEWEST];
    case "subject":
      return [{ property: "subject", isAscending: true }, NEWEST];
    case "size":
      return [{ property: "size", isAscending: false }, NEWEST];
  }
};

/** A mail with the category keywords of its account, for comparing across accounts. */
export type SortItem = { email: EmailSummary; categories: string[] };

const time = (email: EmailSummary) => Date.parse(email.receivedAt);
const text = (value: string) => value.trim().toLocaleLowerCase();
const byText = (a: string, b: string) => text(a).localeCompare(text(b));
const flag = (email: EmailSummary, keyword: string) => (email.keywords[keyword] ? 1 : 0);
/**
 * Category by category in the account's order, as the server's one comparator per category
 * does (RFC 8620 §5.5): having the first decides, then the second, and so on; none last.
 */
const byCategories = (a: SortItem, b: SortItem) => {
  const length = Math.max(a.categories.length, b.categories.length);
  for (let index = 0; index < length; index++) {
    const has = (item: SortItem) => {
      const keyword = item.categories[index];
      return keyword === undefined ? 0 : flag(item.email, keyword);
    };
    const difference = has(b) - has(a);
    if (difference) return difference;
  }
  return 0;
};

const PRIMARY: Record<MailSort, (a: SortItem, b: SortItem) => number> = {
  newest: () => 0,
  oldest: (a, b) => time(a.email) - time(b.email),
  unread: (a, b) => flag(a.email, "$seen") - flag(b.email, "$seen"),
  flagged: (a, b) => flag(b.email, "$flagged") - flag(a.email, "$flagged"),
  category: byCategories,
  from: (a, b) => byText(displayName(a.email.from?.[0]), displayName(b.email.from?.[0])),
  subject: (a, b) => byText(a.email.subject ?? "", b.email.subject ?? ""),
  size: (a, b) => b.email.size - a.email.size,
};

/**
 * The same order on the client, for merging the lists of several accounts. Sender and subject
 * are compared as the browser sorts text, which may differ from the server in details; the lists
 * are merged, not re-sorted, so each account keeps the server's order.
 */
export const compareMails =
  (sort: MailSort) =>
  (a: SortItem, b: SortItem): number =>
    PRIMARY[sort](a, b) || time(b.email) - time(a.email);
