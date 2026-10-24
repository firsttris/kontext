/**
 * The search box's language, like Gmail's: free words plus operators, in German and English
 * (`von:hoffmann`, `from:hoffmann`, `hat:anhang`, `in:info@`, `nach:01.10.2026`,
 * `kategorie:erledigt` …). Parsed into
 * a query, turned into a JMAP Email/query filter per account (RFC 8621 §4.4.1).
 */
import type { Mailbox } from "@/jmap/types";
import type { Category } from "./categories";
import { addDays, fromLocal } from "./jscalendar";

export type SearchQuery = {
  /** Free words and "quoted phrases", searched everywhere (subject, addresses, text). */
  words: string[];
  from: string[];
  to: string[];
  subject: string[];
  /** Category names, matched in each account by its own categories. */
  categories: string[];
  hasAttachment: boolean;
  unread: boolean;
  flagged: boolean;
  /** YYYY-MM-DD: received before this day / on or after this day. */
  before?: string;
  after?: string;
  /** A folder (name, path or role) or a mailbox ("info@"). */
  in?: string;
};

const EMPTY: SearchQuery = {
  words: [],
  from: [],
  to: [],
  subject: [],
  categories: [],
  hasAttachment: false,
  unread: false,
  flagged: false,
};

/** Operator names, German first; all map to one meaning. */
const KEYS: Record<string, keyof SearchQuery> = {
  von: "from",
  from: "from",
  an: "to",
  to: "to",
  betreff: "subject",
  subject: "subject",
  vor: "before",
  before: "before",
  nach: "after",
  after: "after",
  seit: "after",
  in: "in",
  kategorie: "categories",
  category: "categories",
  label: "categories",
};

const FLAGS: Record<string, "hasAttachment" | "unread" | "flagged"> = {
  "hat:anhang": "hasAttachment",
  "has:attachment": "hasAttachment",
  "ist:ungelesen": "unread",
  "is:unread": "unread",
  "ist:markiert": "flagged",
  "is:starred": "flagged",
  "is:flagged": "flagged",
};

/** Words and operators; quotes keep phrases together (`betreff:"neues angebot"`). */
export const tokenize = (input: string): string[] =>
  [...input.matchAll(/(?:[^\s"]+:)?"[^"]*"?|\S+/g)].map((match) => match[0]);

const unquote = (value: string): string => value.replace(/^"|"$/g, "");

/** "2026-10-01", "1.10.2026", "1.10." (this year), "heute", "gestern" → YYYY-MM-DD. */
export const parseDay = (value: string, today: string): string | undefined => {
  const text = value.trim().toLowerCase();
  if (text === "heute" || text === "today") return today;
  if (text === "gestern" || text === "yesterday") return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
  if (!german) return undefined;
  const [, day, month, year] = german;
  return `${year ?? today.slice(0, 4)}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
};

export const parseSearch = (input: string, today: string): SearchQuery => {
  const query: SearchQuery = {
    ...EMPTY,
    words: [],
    from: [],
    to: [],
    subject: [],
    categories: [],
  };
  for (const token of tokenize(input)) {
    const flag = FLAGS[token.toLowerCase()];
    if (flag) {
      query[flag] = true;
      continue;
    }
    const operator = token.match(/^([a-zä]+):(.+)$/i);
    const key = operator ? KEYS[operator[1]!.toLowerCase()] : undefined;
    if (!operator || !key) {
      const word = unquote(token);
      if (word) query.words.push(word);
      continue;
    }
    const value = unquote(operator[2]!);
    if (key === "from" || key === "to" || key === "subject" || key === "categories")
      query[key].push(value);
    else if (key === "before" || key === "after") query[key] = parseDay(value, today);
    else if (key === "in") query.in = value;
  }
  return query;
};

/** Is there anything to search for? */
export const isEmptySearch = (query: SearchQuery): boolean =>
  !query.words.length &&
  !query.from.length &&
  !query.to.length &&
  !query.subject.length &&
  !query.categories.length &&
  !query.hasAttachment &&
  !query.unread &&
  !query.flagged &&
  !query.before &&
  !query.after &&
  !query.in;

/** The words to mark in the results, with their base forms ("Angebote" marks "Angebot"). */
export const highlightTerms = (query: SearchQuery): string[] => [
  ...new Set(
    [
      ...[...query.words, ...query.subject].flatMap(wordVariants),
      ...query.from,
      ...query.to,
    ].filter((term) => term.length > 1),
  ),
];

const ROLES: Record<string, string> = {
  posteingang: "inbox",
  inbox: "inbox",
  gesendet: "sent",
  sent: "sent",
  entwürfe: "drafts",
  entwurf: "drafts",
  drafts: "drafts",
  archiv: "archive",
  archive: "archive",
  papierkorb: "trash",
  trash: "trash",
  spam: "junk",
  junk: "junk",
  markiert: "flagged",
};

const midnight = (day: string) =>
  fromLocal(`${day}T00:00:00`)
    .toISOString()
    .replace(/\.\d+Z$/, "Z");

/** The folder `in:` names in this account, by role, name or path ("Kunden/Hoffmann"). */
const findFolder = (mailboxes: Mailbox[], name: string, path: (m: Mailbox) => string) => {
  const wanted = name.toLowerCase();
  const role = ROLES[wanted];
  return (
    (role && mailboxes.find((mailbox) => mailbox.role === role)) ||
    mailboxes.find((mailbox) => path(mailbox).toLowerCase() === wanted) ||
    mailboxes.find((mailbox) => mailbox.name.toLowerCase() === wanted)
  );
};

export type SearchAccount = {
  /** "info@" for a shared mailbox, the address for the own one. */
  label: string;
  isPersonal: boolean;
  mailboxes: Mailbox[];
  /** "Kunden/Hoffmann" for a mailbox. */
  path: (mailbox: Mailbox) => string;
  categories: Category[];
};

/**
 * The JMAP filter for one account, or null when the query cannot match there (`in:info@` in
 * another account, or a folder the account does not have). Without `in:`, trash and spam are
 * left out, as in Gmail.
 */
export const toEmailFilter = (
  query: SearchQuery,
  account: SearchAccount,
): Record<string, unknown> | null => {
  const conditions: Record<string, unknown>[] = [];
  if (query.in) {
    const target = query.in.toLowerCase();
    if (target.includes("@")) {
      // "info@" or "info@weber-haustechnik.test": the mailbox, compared by its local part.
      const local = (address: string) => address.toLowerCase().replace(/@.*$/, "@");
      if (local(account.label) !== local(target)) return null;
      conditions.push(...excludeTrash(account.mailboxes));
    } else {
      const folder = findFolder(account.mailboxes, query.in, account.path);
      if (!folder) return null;
      conditions.push(
        folder.role === "flagged" ? { hasKeyword: "$flagged" } : { inMailbox: folder.id },
      );
    }
  } else {
    conditions.push(...excludeTrash(account.mailboxes));
  }
  for (const word of query.words) conditions.push(anyOf("text", wordVariants(word)));
  for (const from of query.from) conditions.push({ from });
  for (const to of query.to) conditions.push({ to });
  for (const subject of query.subject) conditions.push(anyOf("subject", wordVariants(subject)));
  for (const name of query.categories) {
    // A category is the account's own: where none has the name, nothing there can match.
    const category = account.categories.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (!category) return null;
    conditions.push({ hasKeyword: category.keyword });
  }
  if (query.hasAttachment) conditions.push({ hasAttachment: true });
  if (query.unread) conditions.push({ notKeyword: "$seen" });
  if (query.flagged) conditions.push({ hasKeyword: "$flagged" });
  if (query.after) conditions.push({ after: midnight(query.after) });
  if (query.before) conditions.push({ before: midnight(query.before) });
  if (conditions.length === 0) return {};
  return conditions.length === 1 ? conditions[0]! : { operator: "AND", conditions };
};

const anyOf = (property: string, values: string[]): Record<string, unknown> =>
  values.length === 1
    ? { [property]: values[0] }
    : { operator: "OR", conditions: values.map((value) => ({ [property]: value })) };

/** German endings that are cut off to find the singular or base form. */
const ENDINGS: [string, string][] = [
  ["ungen", "ung"],
  ["innen", "in"],
  ["en", ""],
  ["es", ""],
  ["e", ""],
  ["n", ""],
  ["s", ""],
];

/**
 * The word and its base form ("Angebote" → "Angebot", "Rechnungen" → "Rechnung"). Stalwart's index
 * stems words, but a word that is already its own stem ("Angebot") is only found by exactly that
 * word, so the app also asks for the base form. Phrases and short words stay as they are.
 */
export const wordVariants = (word: string): string[] => {
  if (/\s/.test(word) || word.length < 5) return [word];
  const lower = word.toLowerCase();
  const match = ENDINGS.find(
    ([ending, replacement]) =>
      lower.endsWith(ending) && word.length - ending.length + replacement.length >= 4,
  );
  if (!match) return [word];
  const base = word.slice(0, word.length - match[0].length) + match[1];
  return base.toLowerCase() === lower ? [word] : [word, base];
};

const excludeTrash = (mailboxes: Mailbox[]): Record<string, unknown>[] => {
  const ids = mailboxes
    .filter((mailbox) => mailbox.role === "trash" || mailbox.role === "junk")
    .map((mailbox) => mailbox.id);
  return ids.length ? [{ inMailboxOtherThan: ids }] : [];
};

/**
 * Adds an operator to the query, or takes it out if it is there ("hat:anhang" for the chip "Mit
 * Anhang"). Operators with a value (`nach:…`) replace an earlier one of the same kind.
 */
export const toggleToken = (input: string, token: string): string => {
  const tokens = tokenize(input);
  const lower = token.toLowerCase();
  if (tokens.some((t) => t.toLowerCase() === lower))
    return tokens.filter((t) => t.toLowerCase() !== lower).join(" ");
  const key = lower.match(/^([a-zä]+):/)?.[1];
  const sameKind = key && ["nach", "vor", "in", "after", "before", "seit"].includes(key);
  const kept = sameKind ? tokens.filter((t) => !t.toLowerCase().startsWith(`${key}:`)) : tokens;
  return [...kept, token].join(" ");
};

/** "nach:2026-09-23" for "the last 30 days". */
export const sinceDays = (days: number, today: string): string => `nach:${addDays(today, -days)}`;
