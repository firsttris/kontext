/**
 * Pictures of people: the square a photo is cut to, and which contact photos the app shows.
 * Pure; the drawing is in features/photos/make-photo.ts.
 */
import type { EmailAddress } from "@/jmap/types";
import { fromSender } from "./sender-check";

/** Side of a profile or contact photo: sharp at the largest avatar (72 px) on a 3× screen. */
export const PHOTO_PX = 256;

/** The largest centred square of a picture, to cut out before scaling. */
export const squareCrop = (width: number, height: number) => {
  const side = Math.min(width, height);
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), side };
};

/** Raster formats by how their base64 starts: the first bytes of JPEG, PNG, GIF and WebP (RIFF). */
const SNIFFED: [prefix: string, type: string][] = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
];

/**
 * A contact photo the app may show, as `data:image/…;base64,…`: only one carried in the card
 * itself. A link to a picture elsewhere would tell its server when one looks at the contact, so it
 * stays unloaded. A photo synced from an iPhone or Mac (vCard 3.0 `PHOTO;ENCODING=b;TYPE=JPEG`)
 * comes from Stalwart without a media type, as `data:;base64,…` (calcard 0.3.14:
 * src/vcard/parser.rs keeps it as Binary without content type, src/vcard/utils.rs
 * `to_unwrapped_string`); its type is then read from its first bytes. Never SVG, which can carry
 * links and scripts.
 */
export const inlinePhoto = (uri: string): string | undefined => {
  const match = /^data:([^;,]*);base64,(.+)$/is.exec(uri.trim());
  if (!match) return undefined;
  const [, declared = "", data = ""] = match;
  const type = declared.toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/.test(type)) return uri.trim();
  if (type && type !== "application/octet-stream") return undefined;
  const sniffed = SNIFFED.find(([prefix]) => data.startsWith(prefix))?.[1];
  return sniffed ? `data:${sniffed};base64,${data}` : undefined;
};

/** "jonas@firma.de" and "Jonas@Firma.de" are the same person. */
export const addressKey = (address: string | null | undefined): string =>
  (address ?? "").trim().toLowerCase();

/** Whom a photo is wanted for: a colleague's account id, an address, or both. */
export type PhotoKey = { id?: string | null; email?: string | null };

export const colleaguePhotoUrl = (accountId: string, version: number): string =>
  `/api/photos/${encodeURIComponent(accountId)}?v=${version}`;

/**
 * Finds a person's photo: the colleague's own profile photo first (by account id, or by their
 * address), else the photo in one's contacts for that address.
 */
export const photoFinder = ({
  versions,
  colleagues,
  contacts,
}: {
  /** Account id → version of every profile photo (/api/photos). */
  versions: Record<string, number>;
  /** The company's people, to find a colleague by address. */
  colleagues: { id: string; email?: string | null }[];
  /** Address (as addressKey) → contact photo. */
  contacts: ReadonlyMap<string, string>;
}) => {
  const idOfAddress = new Map(
    colleagues.filter((c) => c.email).map((c) => [addressKey(c.email), c.id] as const),
  );
  return ({ id, email }: PhotoKey): string | undefined => {
    const accountId = [id, idOfAddress.get(addressKey(email))].find(
      (candidate) => candidate && versions[candidate] !== undefined,
    );
    if (accountId) return colleaguePhotoUrl(accountId, versions[accountId]!);
    return email ? contacts.get(addressKey(email)) : undefined;
  };
};

/**
 * Whose photo a mail shows: its sender's, only when the mail may be taken as theirs. A forged
 * "chef@firma.de" from outside gets no face, which would make it look all the more real.
 */
export const mailSenderKey = (
  from: EmailAddress | undefined,
  authenticationResults: string[] | null | undefined,
): PhotoKey =>
  from?.email && fromSender(from.email, authenticationResults) ? { email: from.email } : {};
