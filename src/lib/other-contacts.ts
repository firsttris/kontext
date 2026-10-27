/**
 * "Weitere Kontakte", as Gmail calls them: people the user exchanged mails with who are not in
 * any address book. Nothing is stored; the list is read from the latest mails each time, so a
 * person disappears from it as soon as they are saved as a contact.
 */
import type { EmailAddress } from "@/jmap/types";

/** The part of a mail this needs. */
export type Correspondence = {
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  receivedAt: string;
  /** Sent to a list (List-Id or List-Unsubscribe): a newsletter, not a person. */
  bulk: boolean;
};

export type OtherContact = { name: string; email: string; count: number; lastAt: string };

/** Addresses no person reads: "noreply@", "mailer-daemon@", "notifications@" … */
const AUTOMATED =
  /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|newsletter)([+._-]|@)/i;

const lower = (address: string) => address.trim().toLowerCase();

/** Whom a mail is with: the recipients of one the user sent, the sender of one they received. */
const peopleIn = (mail: Correspondence, own: Set<string>): EmailAddress[] => {
  const sender = mail.from?.[0];
  if (sender && own.has(lower(sender.email))) return [...(mail.to ?? []), ...(mail.cc ?? [])];
  return sender && !mail.bulk ? [sender] : [];
};

/**
 * Everyone the mails are with, except the user's own addresses and those already `known`
 * (contacts, colleagues); the most recent first, with the name they last used.
 */
export const otherContacts = (
  mails: Correspondence[],
  { own, known }: { own: string[]; known: string[] },
): OtherContact[] => {
  const ownSet = new Set(own.map(lower));
  const skip = new Set([...ownSet, ...known.map(lower)]);
  const people = new Map<string, OtherContact>();
  for (const mail of mails) {
    for (const person of peopleIn(mail, ownSet)) {
      const key = lower(person.email);
      if (!key.includes("@") || skip.has(key) || AUTOMATED.test(key)) continue;
      const seen = people.get(key);
      const name = person.name?.trim() ?? "";
      if (!seen) {
        people.set(key, { name, email: person.email.trim(), count: 1, lastAt: mail.receivedAt });
        continue;
      }
      const newer = mail.receivedAt > seen.lastAt;
      people.set(key, {
        ...seen,
        name: (newer && name) || seen.name || name,
        count: seen.count + 1,
        lastAt: newer ? mail.receivedAt : seen.lastAt,
      });
    }
  }
  return [...people.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
};
