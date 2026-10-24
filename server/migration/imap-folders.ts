/**
 * Where a folder of the old mailbox (IMAP, e.g. Gmail) lands and which flags become keywords.
 * Gmail shows every label as a folder and the same mail in several of them; "All Mail",
 * "Important" and "Starred" are views, not folders (special-use flags, RFC 6154). Pure functions.
 */
import type { TargetFolder } from "./folders";

export type ImapFolder = {
  path: string;
  delimiter: string;
  specialUse?: string;
  flags: Set<string> | string[];
};

const ROLE_BY_USE: Record<string, string> = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\Drafts": "drafts",
  "\\Archive": "archive",
};

/** Views and folders that are not moved: everything is in a real folder already. */
const SKIPPED_USES = new Set(["\\All", "\\Important", "\\Flagged", "\\Junk", "\\Trash"]);

const has = (flags: ImapFolder["flags"], flag: string) =>
  [...flags].some((f) => f.toLowerCase() === flag.toLowerCase());

/** The target of a folder, or null for views, spam, trash and folders that hold nothing. */
export const imapTarget = (folder: ImapFolder): TargetFolder | null => {
  if (has(folder.flags, "\\Noselect") || has(folder.flags, "\\NonExistent")) return null;
  const use = folder.specialUse ?? [...folder.flags].find((f) => SKIPPED_USES.has(f));
  if (use && SKIPPED_USES.has(use)) return null;
  if (folder.path.toUpperCase() === "INBOX") return { role: "inbox", path: [] };
  const role = use ? ROLE_BY_USE[use] : undefined;
  if (role) return { role, path: [] };
  const path = folder.delimiter ? folder.path.split(folder.delimiter) : [folder.path];
  // Gmail keeps its own folders under "[Gmail]" or, in Germany, "[Google Mail]".
  return { role: null, path: path.filter((part, i) => !(i === 0 && /^\[.+\]$/.test(part))) };
};

/** The inbox first, so a mail in the inbox and under a label is imported there. */
export const folderOrder = (a: TargetFolder, b: TargetFolder) =>
  Number(b.role === "inbox") - Number(a.role === "inbox");

const KEYWORDS: Record<string, string> = {
  "\\seen": "$seen",
  "\\flagged": "$flagged",
  "\\answered": "$answered",
  "\\draft": "$draft",
  $forwarded: "$forwarded",
};

/** IMAP flags (RFC 9051) as JMAP keywords (RFC 8621 §4.1.1). */
export const keywordsOf = (flags: Iterable<string>): Record<string, true> =>
  Object.fromEntries(
    [...flags]
      .map((flag) => KEYWORDS[flag.toLowerCase()])
      .filter((keyword): keyword is string => Boolean(keyword))
      .map((keyword) => [keyword, true as const]),
  );
