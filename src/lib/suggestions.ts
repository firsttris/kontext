/**
 * What the To field and the attendee field suggest while typing: the company's people first,
 * then the contact groups and the contacts. Colleagues are not in anyone's address book, but they
 * are the people one invites most.
 */
import { type Principal, principalName } from "@/jmap/principals";
import type { EmailAddress } from "@/jmap/types";
import type { Suggestion } from "./groups";

/** The people of the company with a mail address, as suggestions. */
export const colleagueAddresses = (colleagues: Principal[]): EmailAddress[] =>
  colleagues
    .filter((p) => p.type === "individual" && p.email)
    .map((p) => ({ name: principalName(p), email: p.email! }));

/** All lists in one, each address once; the first list that has it wins. */
export const mergeSuggestions = (...lists: Suggestion[][]): Suggestion[] => {
  const seen = new Set<string>();
  return lists.flat().filter(({ email }) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Bare addresses with the name a suggestion knows for them, for the chips. */
export const withNames = (emails: string[], known: EmailAddress[]): EmailAddress[] => {
  const names = new Map(known.map((a) => [a.email.toLowerCase(), a.name ?? null]));
  return emails.map((email) => ({ name: names.get(email.toLowerCase()) ?? null, email }));
};
