/**
 * JSContact cards (RFC 9553) as the contacts app edits them: one name, company, mail, phone,
 * address, note and photo. Other properties of a card are kept untouched when it is saved.
 */
import type { EmailAddress } from "@/jmap/types";
import { isInlinePhoto } from "./photo";

type NameComponent = { kind: string; value: string };

export type ContactCard = {
  id: string;
  uid?: string;
  addressBookIds: Record<string, boolean>;
  kind?: string;
  name?: { full?: string; components?: NameComponent[]; isOrdered?: boolean };
  organizations?: Record<string, { name?: string }>;
  emails?: Record<string, { address: string; contexts?: Record<string, boolean>; pref?: number }>;
  phones?: Record<string, { number: string; features?: Record<string, boolean>; pref?: number }>;
  addresses?: Record<string, { components?: NameComponent[]; full?: string }>;
  notes?: Record<string, { note: string }>;
  /** Links (RFC 9553 §2.6.3); Kontext keeps documents of Dokumente here (lib/document-links.ts). */
  links?: Record<string, { "@type"?: "Link"; uri: string; label?: string }>;
  /** Photos, logos and sounds (RFC 9553 §2.6.4); Stalwart takes only `uri`, no `blobId`. */
  media?: Record<string, Media>;
  /** Groups only: the member cards' `uid`s. */
  members?: Record<string, boolean>;
  updated?: string;
};

export type Media = {
  "@type"?: "Media";
  kind: "photo" | "logo" | "sound" | string;
  uri?: string;
  mediaType?: string;
  pref?: number;
};

export type ContactForm = {
  given: string;
  surname: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  note: string;
};

export const emptyContactForm: ContactForm = {
  given: "",
  surname: "",
  company: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  note: "",
};

const first = <T>(record: Record<string, T> | undefined): T | undefined =>
  record ? Object.values(record)[0] : undefined;

const component = (components: NameComponent[] | undefined, kind: string): string =>
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
export const primaryPhone = (card: ContactCard): string => first(card.phones)?.number ?? "";
export const note = (card: ContactCard): string => first(card.notes)?.note ?? "";

export const addressLines = (card: ContactCard): { street: string; city: string } => {
  const address = first(card.addresses);
  if (!address) return { street: "", city: "" };
  const components = address.components ?? [];
  const street = [component(components, "name"), component(components, "number")]
    .filter(Boolean)
    .join(" ");
  const city = [component(components, "postcode"), component(components, "locality")]
    .filter(Boolean)
    .join(" ");
  return street || city ? { street, city } : { street: address.full ?? "", city: "" };
};

export const toForm = (card: ContactCard): ContactForm => ({
  given: givenName(card),
  surname: surname(card),
  company: company(card),
  email: primaryEmail(card),
  phone: primaryPhone(card),
  ...addressLines(card),
  note: note(card),
});

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

const keyOf = <T>(record: Record<string, T> | undefined, fallback: string): string =>
  record ? (Object.keys(record)[0] ?? fallback) : fallback;

/**
 * The card properties to write for a form. Fields left empty remove the property; the keys of
 * existing entries are kept, so other clients' references stay valid.
 */
export const formToCard = (
  form: ContactForm,
  existing?: ContactCard,
): Partial<ContactCard> & Record<string, unknown> => {
  const trimmed = Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v.trim()]),
  ) as ContactForm;
  const components: NameComponent[] = [
    ...(trimmed.given ? [{ kind: "given", value: trimmed.given }] : []),
    ...(trimmed.surname ? [{ kind: "surname", value: trimmed.surname }] : []),
  ];
  const addressComponents: NameComponent[] = [
    ...(trimmed.street ? [{ kind: "name", value: trimmed.street }] : []),
    ...(trimmed.city ? [{ kind: "locality", value: trimmed.city }] : []),
  ];
  const oldEmail = first(existing?.emails);
  const oldPhone = first(existing?.phones);
  return {
    name: components.length
      ? { components, isOrdered: true }
      : trimmed.company
        ? { full: trimmed.company }
        : undefined,
    organizations: trimmed.company
      ? { [keyOf(existing?.organizations, "o")]: { name: trimmed.company } }
      : undefined,
    emails: trimmed.email
      ? {
          [keyOf(existing?.emails, "e")]: {
            ...oldEmail,
            address: trimmed.email,
            contexts: oldEmail?.contexts ?? { work: true },
          },
        }
      : undefined,
    phones: trimmed.phone
      ? {
          [keyOf(existing?.phones, "p")]: {
            ...oldPhone,
            number: trimmed.phone,
            features: oldPhone?.features ?? { voice: true },
          },
        }
      : undefined,
    addresses: addressComponents.length
      ? { [keyOf(existing?.addresses, "a")]: { components: addressComponents } }
      : undefined,
    notes: trimmed.note ? { [keyOf(existing?.notes, "n")]: { note: trimmed.note } } : undefined,
  };
};

const photoEntries = (card: Pick<ContactCard, "media">) =>
  Object.entries(card.media ?? {})
    .filter(([, media]) => media.kind === "photo" && media.uri && isInlinePhoto(media.uri))
    // The preferred one first (lower `pref` wins, none comes last).
    .sort(([, a], [, b]) => (a.pref ?? 101) - (b.pref ?? 101));

/** The card's photo as a `data:` URI, if it carries one (links elsewhere are not loaded). */
export const contactPhoto = (card: Pick<ContactCard, "media">): string | undefined =>
  photoEntries(card)[0]?.[1].uri;

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
