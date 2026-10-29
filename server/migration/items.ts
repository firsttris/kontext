/**
 * Contacts and appointments from a move, ready for /set: into the default address book or
 * calendar, without the duplicates a second run would bring. Pure functions; appointments are
 * prepared like a file in the calendar (src/lib/ics-import.ts).
 */

type Card = Record<string, unknown> & {
  name?: { full?: string; components?: { value?: string }[] };
  emails?: Record<string, { address?: string }>;
};

/** Name and first address, lower case: what makes two cards from different files the same. */
export const cardKey = (card: Pick<Card, "name" | "emails">): string => {
  const name =
    card.name?.full ??
    (card.name?.components ?? [])
      .map((part) => part.value ?? "")
      .filter(Boolean)
      .join(" ");
  const email = Object.values(card.emails ?? {})[0]?.address ?? "";
  return `${name.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
};

export const prepareCard = (card: Card, addressBookId: string): Record<string, unknown> => {
  const { id: _, addressBookIds: __, ...rest } = card;
  return {
    ...rest,
    "@type": "Card",
    version: "1.0",
    uid: (card.uid as string | undefined) ?? crypto.randomUUID(),
    addressBookIds: { [addressBookId]: true },
  };
};

/**
 * readpst numbers appointments ("0x1268") instead of giving them a real UID; such events get one
 * derived from their content, so a second run finds them again.
 */
export const eventUid = (uid: unknown, fallback: string): string =>
  typeof uid === "string" && uid && !/^0x[0-9a-f]+$/i.test(uid) ? uid : fallback;

/** A vCard file with many contacts (Google's export) as one text per card (RFC 6350 §3.1). */
export const splitVCards = (text: string): string[] =>
  text.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
