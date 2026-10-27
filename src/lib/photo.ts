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

/**
 * A contact photo the app may show: only one carried in the card itself (`data:`). A link to a
 * picture elsewhere would tell its server when one looks at the contact, so it stays unloaded.
 */
export const isInlinePhoto = (uri: string): boolean =>
  /^data:image\/(jpeg|png|webp|gif);base64,/i.test(uri);

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
