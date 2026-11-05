/**
 * JSContact cards (RFC 9553) as the contacts app reads them. The form that edits them is in
 * contact-form.ts.
 */
import type { EmailAddress } from "@/jmap/types";
import { inlinePhoto } from "./photo";

export type NameComponent = { kind: string; value: string };

/** Work or private (RFC 9553 §1.4.1). */
type Contexts = Record<string, boolean>;

export type ContactCard = {
  id: string;
  uid?: string;
  addressBookIds: Record<string, boolean>;
  kind?: string;
  name?: { full?: string; components?: NameComponent[]; isOrdered?: boolean };
  /** Company and its departments (RFC 9553 §2.2.3). */
  organizations?: Record<string, { name?: string; units?: { name: string }[] }>;
  /** Job titles (kind "title", the default) and roles (RFC 9553 §2.2.5). */
  titles?: Record<string, { "@type"?: "Title"; name: string; kind?: string }>;
  /** RFC 9553 §2.3.1. */
  emails?: Record<string, { address: string; contexts?: Contexts; pref?: number }>;
  /** RFC 9553 §2.3.3: `features` says mobile, voice, fax …, `contexts` work or private. */
  phones?: Record<
    string,
    { number: string; features?: Record<string, boolean>; contexts?: Contexts; pref?: number }
  >;
  /** RFC 9553 §2.5.1; `full` is the whole address for display, `countryCode` ISO 3166-1. */
  addresses?: Record<
    string,
    { components?: NameComponent[]; full?: string; countryCode?: string; contexts?: Contexts }
  >;
  notes?: Record<string, { note: string }>;
  /** Links (RFC 9553 §2.6.3); Kontext keeps documents of Dokumente here (lib/document-links.ts). */
  links?: Record<string, { "@type"?: "Link"; uri: string; kind?: string; label?: string }>;
  /**
   * Photos, logos and sounds (RFC 9553 §2.6.4). Stalwart takes only `uri`; 1.0 gives a stored one
   * back as `blobId`, which jmap/contacts.ts turns into a `data:` URI again.
   */
  media?: Record<string, Media>;
  /** Birthdays and other days (RFC 9553 §2.8.1); read for the birthday calendar (birthdays.ts). */
  anniversaries?: Record<string, Anniversary>;
  /** Groups only: the member cards' `uid`s. */
  members?: Record<string, boolean>;
  updated?: string;
};

/** A day of a card: a date with or without its year, or an instant (RFC 9553 §2.8.1). */
export type Anniversary = {
  "@type"?: "Anniversary";
  kind: "birth" | "death" | "wedding" | string;
  date:
    | { "@type"?: "PartialDate"; year?: number; month?: number; day?: number }
    | { "@type": "Timestamp"; utc: string };
};

export type Media = {
  "@type"?: "Media";
  kind: "photo" | "logo" | "sound" | string;
  uri?: string;
  blobId?: string;
  mediaType?: string;
  pref?: number;
};

export const first = <T>(record: Record<string, T> | undefined): T | undefined =>
  record ? Object.values(record)[0] : undefined;

export const component = (components: NameComponent[] | undefined, kind: string): string =>
  components
    ?.filter((c) => c.kind === kind)
    .map((c) => c.value)
    .join(" ") ?? "";

export const givenName = (card: ContactCard): string => component(card.name?.components, "given");
export const surname = (card: ContactCard): string => component(card.name?.components, "surname");
export const company = (card: ContactCard): string => first(card.organizations)?.name ?? "";

export const fullName = (card: ContactCard): string => {
  const fromParts = [givenName(card), surname(card)].filter(Boolean).join(" ");
  return fromParts || card.name?.full || company(card) || primaryEmail(card) || "—";
};

export const primaryEmail = (card: ContactCard): string => first(card.emails)?.address ?? "";
/** Every address of the card, the first one first. */
export const allEmails = (card: ContactCard): string[] =>
  Object.values(card.emails ?? {}).flatMap((email) => (email.address ? [email.address] : []));
export const primaryPhone = (card: ContactCard): string => first(card.phones)?.number ?? "";
export const note = (card: ContactCard): string => first(card.notes)?.note ?? "";

/** Sorted by surname, then given name, as in a phone book. */
export const sortKey = (card: ContactCard): string =>
  `${surname(card) || company(card) || givenName(card) || card.name?.full || primaryEmail(card)} ${givenName(card)}`.toLocaleLowerCase(
    "de",
  );

export const matchesSearch = (card: ContactCard, text: string): boolean => {
  const needle = text.trim().toLocaleLowerCase("de");
  if (!needle) return true;
  return [fullName(card), company(card), primaryEmail(card), primaryPhone(card)]
    .join(" ")
    .toLocaleLowerCase("de")
    .includes(needle);
};

const photoEntries = (card: Pick<ContactCard, "media">) =>
  Object.entries(card.media ?? {})
    .filter(([, media]) => media.kind === "photo" && media.uri && inlinePhoto(media.uri))
    // The preferred one first (lower `pref` wins, none comes last).
    .sort(([, a], [, b]) => (a.pref ?? 101) - (b.pref ?? 101));

/** The card's photo as a `data:` URI, if it carries one (links elsewhere are not loaded). */
export const contactPhoto = (card: Pick<ContactCard, "media">): string | undefined => {
  const uri = photoEntries(card)[0]?.[1].uri;
  return uri ? inlinePhoto(uri) : undefined;
};

/**
 * The `media` to write for a new photo (a `data:` URI) or none (`null`): logos and sounds stay,
 * the photo keeps its key. `undefined` when nothing is left, which removes the property.
 */
export const mediaWithPhoto = (
  uri: string | null,
  existing?: Pick<ContactCard, "media">,
): Record<string, Media> | undefined => {
  const media = existing?.media ?? {};
  const key = photoEntries({ media })[0]?.[0] ?? "photo";
  const others = Object.fromEntries(
    Object.entries(media).filter(([, entry]) => entry.kind !== "photo"),
  );
  const next = uri
    ? {
        ...others,
        [key]: {
          "@type": "Media" as const,
          kind: "photo",
          uri,
          mediaType: uri.slice(5, uri.indexOf(";")),
        },
      }
    : others;
  return Object.keys(next).length ? next : undefined;
};

/** Mail addresses of all contacts, for the suggestions in the To field. */
export const contactAddresses = (cards: ContactCard[]): EmailAddress[] =>
  cards.flatMap((card) =>
    Object.values(card.emails ?? {}).map((email) => ({
      name: fullName(card),
      email: email.address,
    })),
  );

/** First letter for the list's section headers. */
export const indexLetter = (card: ContactCard): string => {
  const letter = sortKey(card).charAt(0).toLocaleUpperCase("de");
  return /\p{L}/u.test(letter) ? letter : "#";
};
