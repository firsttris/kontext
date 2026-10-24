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

/** A new card from a mail address: "Petra Keller" → given "Petra", surname "Keller". */
export const contactFormFor = (address: EmailAddress): ContactForm => {
  const words = (address.name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    ...emptyContactForm,
    given: words.slice(0, -1).join(" ") || (words.length === 1 ? (words[0] ?? "") : ""),
    surname: words.length > 1 ? (words.at(-1) ?? "") : "",
    email: address.email,
  };
};
