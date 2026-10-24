/**
 * Several mails chosen in a list, as in Gmail: one by one, a range with Shift, all at once. A
 * mail is known by account and id, since "Alle Posteingänge" and the search mix mailboxes. Pure.
 */
import type { EmailSummary } from "@/jmap/types";
import type { Category } from "./categories";

export type Picked = { accountId: string; email: EmailSummary };

export const pickKey = (accountId: string, emailId: string): string => `${accountId}/${emailId}`;

export const toggleKey = (selected: Set<string>, key: string): Set<string> => {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/** Shift: everything between the last one picked and this one, in list order, added. */
export const addRange = (
  selected: Set<string>,
  order: string[],
  anchor: string | undefined,
  key: string,
): Set<string> => {
  const from = anchor ? order.indexOf(anchor) : -1;
  const to = order.indexOf(key);
  if (from < 0 || to < 0) return toggleKey(selected, key);
  const [low, high] = from < to ? [from, to] : [to, from];
  return new Set([...selected, ...order.slice(low, high + 1)]);
};

/** Only what is still in the list (after moving, a new page, another filter). */
export const keepListed = (selected: Set<string>, order: string[]): Set<string> => {
  const listed = new Set(order);
  const kept = [...selected].filter((key) => listed.has(key));
  return kept.length === selected.size ? selected : new Set(kept);
};

export type Group = { accountId: string; from: string; emails: EmailSummary[] };

/**
 * The picked mails by account and the folder they are taken out of: the open folder where they
 * lie in it, otherwise their own (a search mixes folders).
 */
export const groupsOf = (picked: Picked[], folderId?: string): Group[] => {
  const groups = new Map<string, Group>();
  for (const { accountId, email } of picked) {
    const from =
      folderId && email.mailboxIds[folderId] ? folderId : (Object.keys(email.mailboxIds)[0] ?? "");
    const key = `${accountId}/${from}`;
    const group = groups.get(key) ?? { accountId, from, emails: [] };
    group.emails.push(email);
    groups.set(key, group);
  }
  return [...groups.values()];
};

/** "Gelesen" while one of them is unread, otherwise "Ungelesen". */
export const marksRead = (picked: Picked[]): boolean =>
  picked.some(({ email }) => !email.keywords.$seen);

/** "Markieren" unless all of them are flagged already. */
export const marksFlagged = (picked: Picked[]): boolean =>
  !picked.every(({ email }) => email.keywords.$flagged);

/** Whether all, some or none of the picked mails have the category. */
export const categoryState = (picked: Picked[], category: Category): "all" | "some" | "none" => {
  const count = picked.filter(({ email }) => email.keywords[category.keyword]).length;
  return count === 0 ? "none" : count === picked.length ? "all" : "some";
};

/** The one account of a selection, or null when it spans several. */
export const singleAccount = (picked: Picked[]): string | null => {
  const accounts = new Set(picked.map(({ accountId }) => accountId));
  return accounts.size === 1 ? [...accounts][0]! : null;
};
