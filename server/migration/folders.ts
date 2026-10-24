/**
 * Where a folder from Outlook lands: the special folders (German and English names) on their JMAP
 * role (RFC 8621 §2), everything else under the same path. Pure functions.
 */

export type TargetFolder = { role: string | null; path: string[] };

const ROLES: Record<string, string> = {
  posteingang: "inbox",
  inbox: "inbox",
  "gesendete elemente": "sent",
  "gesendete objekte": "sent",
  "sent items": "sent",
  "sent mail": "sent",
  "gelöschte elemente": "trash",
  "gelöschte objekte": "trash",
  "deleted items": "trash",
  papierkorb: "trash",
  entwürfe: "drafts",
  drafts: "drafts",
  "junk-e-mail": "junk",
  "junk e-mail": "junk",
  junk: "junk",
  spam: "junk",
  archiv: "archive",
  archive: "archive",
};

/** Outlook folders without mail; their items are not moved as mails. */
const SKIPPED = new Set([
  "aufgaben",
  "tasks",
  "notizen",
  "notes",
  "journal",
  "postausgang",
  "outbox",
  "synchronisierungsprobleme",
  "sync issues",
  "conversation action settings",
  "quick step settings",
]);

/**
 * The target of a folder path as readpst writes it. The first part is the name of the data file
 * ("Persönliche Ordner", "Outlook-Datendatei"); null for folders that hold no mail.
 */
export const targetFolder = (pstPath: string[]): TargetFolder | null => {
  const [, ...path] = pstPath;
  if (path.some((name) => SKIPPED.has(name.toLowerCase()))) return null;
  if (!path.length) return { role: "inbox", path: [] };
  const role = ROLES[path[0]!.toLowerCase()] ?? null;
  return role ? { role, path: path.slice(1) } : { role: null, path };
};
