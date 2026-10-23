/**
 * Contact groups as JSContact defines them (RFC 9553 §2.1.4, §2.1.6): a card of kind "group"
 * whose `members` map holds the `uid`s of the member cards. Stalwart stores them like any card.
 */
import type { EmailAddress } from "@/jmap/types";
import { type ContactCard, fullName, primaryEmail, sortKey } from "./jscontact";

export const isGroup = (card: ContactCard): boolean => card.kind === "group";

export const memberUids = (group: ContactCard): string[] =>
  Object.entries(group.members ?? {})
    .filter(([, member]) => member)
    .map(([uid]) => uid);

/** The members found among the cards, sorted like the list; unknown uids are left out. */
export const membersOf = <T extends ContactCard>(group: ContactCard, cards: T[]): T[] => {
  const uids = new Set(memberUids(group));
  return cards
    .filter((card) => !isGroup(card) && card.uid && uids.has(card.uid))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));
};

/** The groups a card belongs to. */
export const groupsOf = <T extends ContactCard>(card: ContactCard, groups: T[]): T[] =>
  card.uid ? groups.filter((group) => group.members?.[card.uid!]) : [];

/** The properties of a group card with this name and members. */
export const groupToCard = (name: string, uids: string[]): Record<string, unknown> => ({
  kind: "group",
  name: { full: name.trim() },
  members: Object.fromEntries(uids.map((uid) => [uid, true])),
});

/** A suggestion in the To field; picking a group adds all its members. */
export type Suggestion = EmailAddress & { members?: EmailAddress[] };

/** The members' addresses ("Name <mail>"), for a mail to the whole group. */
export const groupAddresses = (group: ContactCard, cards: ContactCard[]): EmailAddress[] =>
  membersOf(group, cards)
    .filter((card) => primaryEmail(card))
    .map((card) => ({ name: fullName(card), email: primaryEmail(card) }));

/** Groups with at least one member who has a mail address, as suggestions. */
export const groupSuggestions = (cards: ContactCard[]): Suggestion[] =>
  cards.filter(isGroup).flatMap((group) => {
    const members = groupAddresses(group, cards);
    return members.length
      ? [{ name: fullName(group), email: `gruppe:${group.uid ?? group.id}`, members }]
      : [];
  });
