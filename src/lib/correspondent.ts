/** Who the open mail is with, for the panel beside it: the person, their contact card, a new card. */
import type { EmailAddress } from "@/jmap/types";
import { type ContactCard, type ContactForm, emptyContactForm } from "./jscontact";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The other side of a mail: its sender, or for a mail the user sent (from one of their own
 * addresses, info@ included) the first recipient who is not them.
 */
export const correspondent = (
  email: { from: EmailAddress[] | null; to: EmailAddress[] | null; cc?: EmailAddress[] | null },
  own: string[],
): EmailAddress | undefined => {
  const isOwn = (address: EmailAddress) => own.some((mine) => same(mine, address.email));
  const sender = email.from?.[0];
  if (sender && !isOwn(sender)) return sender;
  return [...(email.to ?? []), ...(email.cc ?? [])].find((address) => !isOwn(address));
};

/** The card with this mail address, any of its addresses, ignoring case. */
export const findContact = <T extends ContactCard>(cards: T[], address: string): T | undefined =>
  cards.find((card) => Object.values(card.emails ?? {}).some((e) => same(e.address, address)));

type NameParts = Pick<ContactForm, "given" | "surname">;

/** "Petra Keller" → given "Petra", surname "Keller": the last word is the surname. */
const splitGivenFirst = (name: string): NameParts => {
  const words = name.split(/\s+/).filter(Boolean);
  return {
    given: words.slice(0, -1).join(" ") || (words.length === 1 ? (words[0] ?? "") : ""),
    surname: words.length > 1 ? (words.at(-1) ?? "") : "",
  };
};

/** Lowercase name particles that belong to the surname: "von der Heide", "van Dijk", "zu Salm". */
const PARTICLES = new Set(
  "von van vom zu zum zur de der den del della di da du dos das ten ter le la".split(" "),
);

/** One word ("Keller", "Müller-Lüdenscheidt"), optionally after particles ("von der Heide"). */
const looksLikeSurname = (text: string): boolean => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.slice(0, -1).every((word) => PARTICLES.has(word));
};

/**
 * "Keller, Petra" → given "Petra", surname "Keller": Outlook and many company directories show
 * names surname first with one comma. When the part before the comma is no surname, what follows
 * is a suffix ("Jonas Weber, MBA", "Müller GmbH, Vertrieb") and is left out.
 */
const nameParts = (name: string): NameParts => {
  const parts = name.split(",").map((part) => part.trim());
  const [before = "", after = ""] = parts;
  if (parts.length !== 2 || !before || !after) return splitGivenFirst(name.trim());
  return looksLikeSurname(before) ? { given: after, surname: before } : splitGivenFirst(before);
};

/** A new card from a mail address, its name split into given name and surname. */
export const contactFormFor = (address: EmailAddress): ContactForm => ({
  ...emptyContactForm,
  ...nameParts(address.name ?? ""),
  email: address.email,
});
