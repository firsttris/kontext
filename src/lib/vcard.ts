/**
 * vCard files for import and export. Reading is left to Stalwart (`ContactCard/parse`, RFC 9555
 * mapping); here the file is only split into single cards, and the export writes vCard 4.0
 * (RFC 6350) for the properties the app edits.
 */
import { memberUids } from "./groups";
import { type ContactCard, fullName, givenName, surname } from "./jscontact";

/** The single `BEGIN:VCARD … END:VCARD` blocks of a file, with CRLF line ends. */
export const splitVCards = (text: string): string[] => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cards: string[] = [];
  let current: string[] | null = null;
  let depth = 0;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      if (depth === 0) current = [];
      depth++;
    }
    if (current) current.push(line);
    if (upper === "END:VCARD" && depth > 0) {
      depth--;
      if (depth === 0 && current) {
        cards.push(`${current.join("\r\n")}\r\n`);
        current = null;
      }
    }
  }
  return cards;
};

/** Escapes a text value (RFC 6350 §3.4). */
const escapeText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** Folds a content line at 75 octets, continuation lines start with a space (§3.2). */
export const foldLine = (line: string): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let part = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(part);
      part = "";
      size = 0;
    }
    part += char;
    size += bytes;
  }
  parts.push(part);
  return parts.join("\r\n ");
};

const component = (
  components: { kind: string; value: string }[] | undefined,
  kind: string,
): string =>
  components
    ?.filter((c) => c.kind === kind)
    .map((c) => escapeText(c.value))
    .join(",") ?? "";

/**
 * The vCard TYPE for a JSContact context: RFC 9555 maps TYPE=home to the context "private" and
 * "work" to "work" (as Stalwart's calcard does, `src/jscontact/{import,export}/params.rs`), so a
 * home address read by `ContactCard/parse` goes back out as home.
 */
const contextType = (context: string): string => (context === "private" ? "home" : context);

/** One card as vCard 4.0. */
export const toVCard = (card: ContactCard): string => {
  const lines = ["BEGIN:VCARD", "VERSION:4.0"];
  if (card.uid) lines.push(`UID:${card.uid}`);
  if (card.kind === "group") lines.push("KIND:group");
  lines.push(`FN:${escapeText(fullName(card))}`);
  if (givenName(card) || surname(card))
    lines.push(`N:${escapeText(surname(card))};${escapeText(givenName(card))};;;`);
  for (const org of Object.values(card.organizations ?? {}))
    if (org.name) lines.push(`ORG:${escapeText(org.name)}`);
  for (const email of Object.values(card.emails ?? {})) {
    const context = Object.keys(email.contexts ?? {})[0];
    const type = context && contextType(context);
    lines.push(`EMAIL${type ? `;TYPE=${type}` : ""}:${email.address}`);
  }
  for (const phone of Object.values(card.phones ?? {})) {
    const features = Object.keys(phone.features ?? {});
    const type = features.map((f) => (f === "mobile" ? "cell" : f)).join(",");
    lines.push(`TEL${type ? `;TYPE=${type}` : ""}:${phone.number}`);
  }
  for (const address of Object.values(card.addresses ?? {})) {
    const parts = address.components;
    const street = [component(parts, "name"), component(parts, "number")].filter(Boolean).join(" ");
    lines.push(
      `ADR:;;${street};${component(parts, "locality")};${component(parts, "region")};${component(parts, "postcode")};${component(parts, "country")}`,
    );
  }
  for (const note of Object.values(card.notes ?? {})) lines.push(`NOTE:${escapeText(note.note)}`);
  for (const uid of memberUids(card))
    lines.push(`MEMBER:${uid.includes(":") ? uid : `urn:uuid:${uid}`}`);
  lines.push("END:VCARD");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

/**
 * Group members from a file point at cards by URI ("urn:uuid:…"); the app keys them by the
 * member's plain `uid`, so a prefix is dropped where that names a known card.
 */
export const normalizeMembers = (card: ContactCard, knownUids: Set<string>): ContactCard => {
  if (!card.members) return card;
  const members = Object.fromEntries(
    Object.entries(card.members).map(([key, value]) => {
      const plain = key.replace(/^urn:uuid:/i, "");
      return [knownUids.has(plain) ? plain : key, value];
    }),
  );
  return { ...card, members };
};

/** A whole file for several cards. */
export const toVCardFile = (cards: ContactCard[]): string => cards.map(toVCard).join("");

/**
 * Is this card already in the book? Same uid, or same name with the same mail address (or both
 * without one) – a second import of the same file then adds nothing.
 */
export const isDuplicate = (card: ContactCard, existing: ContactCard[]): boolean => {
  const email = (c: ContactCard) => (Object.values(c.emails ?? {})[0]?.address ?? "").toLowerCase();
  const name = (c: ContactCard) => fullName(c).toLowerCase();
  return existing.some(
    (other) =>
      (card.uid && other.uid === card.uid) ||
      (name(other) === name(card) && email(other) === email(card)),
  );
};
