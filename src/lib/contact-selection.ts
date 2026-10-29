/**
 * Several contacts picked in the list, to delete, put into a group or export at once. Picking
 * itself (one by one, a range with Shift) is the mail list's (`selection.ts`); this is what is
 * done with them. A card is known by account and id, as the list mixes address books. Pure.
 */
import { isGroup, memberUids } from "./groups";
import { type ContactCard, indexLetter, sortKey } from "./jscontact";

type Card = ContactCard & { accountId: string };

/** The people of the list by their first letter, as the list shows them. */
export const byLetter = <T extends ContactCard>(cards: T[]): [string, T[]][] => {
  const sorted = [...cards].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));
  const letters = new Map<string, T[]>();
  for (const card of sorted) {
    const letter = indexLetter(card);
    letters.set(letter, [...(letters.get(letter) ?? []), card]);
  }
  return [...letters.entries()];
};

/** The cards' ids per account: one `ContactCard/set` each. */
export const idsByAccount = (cards: Card[]): { accountId: string; ids: string[] }[] => {
  const accounts = new Map<string, string[]>();
  for (const card of cards)
    accounts.set(card.accountId, [...(accounts.get(card.accountId) ?? []), card.id]);
  return [...accounts].map(([accountId, ids]) => ({ accountId, ids }));
};

/**
 * The groups the picked contacts can join: members are named by `uid`, which only holds within
 * one account (RFC 9553 §2.1.6), so all of them and the group must share one; and the user must
 * be allowed to change the group. Sorted like the list.
 */
export const groupTargets = <T extends Card>(
  picked: Card[],
  cards: T[],
  mayWrite: (group: T) => boolean,
): T[] => {
  const accounts = new Set(picked.map((card) => card.accountId));
  if (accounts.size !== 1 || picked.some((card) => !card.uid)) return [];
  const [accountId] = accounts;
  return cards
    .filter((card) => isGroup(card) && card.accountId === accountId && mayWrite(card))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));
};

/**
 * The group's whole `members` map with the picked contacts in it, and how many are new; the map
 * is sent whole, as the group editor does. `added` 0: they all belong to it already.
 */
export const withMembers = (
  group: ContactCard,
  picked: ContactCard[],
): { members: Record<string, true>; added: number } => {
  const before = new Set(memberUids(group));
  const fresh = [...new Set(picked.flatMap((card) => (card.uid ? [card.uid] : [])))].filter(
    (uid) => !before.has(uid),
  );
  return {
    members: Object.fromEntries([...before, ...fresh].map((uid) => [uid, true as const])),
    added: fresh.length,
  };
};
