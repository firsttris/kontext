/**
 * The contact form and the JSContact card (RFC 9553) it edits. A card from an iPhone, a vCard or
 * a merge holds more than the form shows: properties whose fields did not change are not written
 * at all, and a changed one keeps its entries, keys and sub-properties the form does not know
 * (a second address, the region, a role …). Pure.
 */
import { birthDate } from "./birthdays";
import { isDocumentKey } from "./document-links";
import {
  type ContactCard,
  company,
  component,
  first,
  givenName,
  type NameComponent,
  note,
  surname,
} from "./jscontact";

/** The kinds of number a person picks from; RFC 9553 §2.3.3 has them as features and contexts. */
export const PHONE_KINDS = ["mobile", "work", "home", "fax"] as const;
export type PhoneKind = (typeof PHONE_KINDS)[number];

/** A row of the form; `key` is the entry's key in the card, none for a new one. */
export type PhoneRow = { key?: string; number: string; kind: PhoneKind };
export type EmailRow = { key?: string; address: string };

export type ContactForm = {
  given: string;
  surname: string;
  company: string;
  department: string;
  jobTitle: string;
  emails: EmailRow[];
  phones: PhoneRow[];
  street: string;
  postcode: string;
  city: string;
  country: string;
  website: string;
  /** "YYYY-MM-DD"; a birthday without its year is not shown and stays as it is. */
  birthday: string;
  note: string;
};

export const emptyContactForm: ContactForm = {
  given: "",
  surname: "",
  company: "",
  department: "",
  jobTitle: "",
  emails: [],
  phones: [],
  street: "",
  postcode: "",
  city: "",
  country: "",
  website: "",
  birthday: "",
  note: "",
};

type Phone = NonNullable<ContactCard["phones"]>[string];

/** A fax or mobile by its feature, otherwise private or work by its context. */
export const phoneKind = (phone: Pick<Phone, "features" | "contexts">): PhoneKind =>
  phone.features?.fax
    ? "fax"
    : phone.features?.mobile
      ? "mobile"
      : phone.contexts?.private
        ? "home"
        : "work";

const phoneKindProps: Record<PhoneKind, Pick<Phone, "features" | "contexts">> = {
  mobile: { features: { mobile: true }, contexts: undefined },
  work: { features: { voice: true }, contexts: { work: true } },
  home: { features: { voice: true }, contexts: { private: true } },
  fax: { features: { fax: true }, contexts: undefined },
};

/** The job title, not a role (RFC 9553 §2.2.5: `kind` is "title" when left out). */
const isJobTitle = (title: { kind?: string }) => (title.kind ?? "title") === "title";
const isBirth = (anniversary: { kind: string }) => anniversary.kind === "birth";
const isWebsite = (_link: unknown, key: string) => !isDocumentKey(key);

const entryWhere = <T>(
  record: Record<string, T> | undefined,
  matches: (value: T, key: string) => boolean,
): [string, T] | undefined =>
  Object.entries(record ?? {}).find(([key, value]) => matches(value, key));

const pad = (n: number) => String(n).padStart(2, "0");

/** Street, postcode, town and country of the first address. */
const addressFields = (card: ContactCard) => {
  const address = first(card.addresses);
  const parts = address?.components ?? [];
  const street = [component(parts, "name"), component(parts, "number")].filter(Boolean).join(" ");
  const locality = component(parts, "locality");
  // Kontext wrote "77815 Bühl" into `locality` before postcode had a field of its own.
  const legacy = component(parts, "postcode") ? null : /^(\d{4,5})\s+(.+)$/.exec(locality);
  const fields = {
    street,
    postcode: legacy?.[1] ?? component(parts, "postcode"),
    city: legacy?.[2] ?? locality,
    country: component(parts, "country"),
  };
  return Object.values(fields).some(Boolean) ? fields : { ...fields, street: address?.full ?? "" };
};

const birthdayField = (card: ContactCard): string => {
  const date = birthDate(card);
  return date?.year ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : "";
};

export const toForm = (card: ContactCard): ContactForm => ({
  given: givenName(card),
  surname: surname(card),
  company: company(card),
  department: first(card.organizations)?.units?.[0]?.name ?? "",
  jobTitle: entryWhere(card.titles, isJobTitle)?.[1].name ?? "",
  emails: Object.entries(card.emails ?? {}).map(([key, email]) => ({
    key,
    address: email.address,
  })),
  phones: Object.entries(card.phones ?? {}).map(([key, phone]) => ({
    key,
    number: phone.number,
    kind: phoneKind(phone),
  })),
  ...addressFields(card),
  website: entryWhere(card.links, isWebsite)?.[1].uri ?? "",
  birthday: birthdayField(card),
  note: note(card),
});

/** Trimmed, without the rows left empty. */
const cleaned = (form: ContactForm): ContactForm => {
  const text = Object.fromEntries(
    Object.entries(form).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value.trim()]] : [],
    ),
  ) as Omit<ContactForm, "emails" | "phones">;
  return {
    ...text,
    emails: form.emails
      .map((row) => ({ ...row, address: row.address.trim() }))
      .filter((row) => row.address),
    phones: form.phones
      .map((row) => ({ ...row, number: row.number.trim() }))
      .filter((row) => row.number),
  };
};

const freshKey = (taken: Set<string>, base: string): string => {
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  taken.add(`${base}${n}`);
  return `${base}${n}`;
};

/**
 * The record with one entry (the first that matches) replaced, or removed when `next` gives
 * nothing; the other entries stay. `undefined` when none is left, which removes the property.
 */
const withEntry = <T>(
  record: Record<string, T> | undefined,
  matches: (value: T, key: string) => boolean,
  base: string,
  next: (old: T | undefined) => T | undefined,
): Record<string, T> | undefined => {
  const found = entryWhere(record, matches);
  const key = found?.[0] ?? freshKey(new Set(Object.keys(record ?? {})), base);
  const value = next(found?.[1]);
  const entries = Object.entries(record ?? {});
  const kept = found
    ? entries.flatMap(([k, v]): [string, T][] => (k !== key ? [[k, v]] : value ? [[k, value]] : []))
    : [...entries, ...(value ? [[key, value] as [string, T]] : [])];
  return kept.length ? Object.fromEntries(kept) : undefined;
};

/** The rows as a record: an existing entry keeps its key and what the row does not show. */
const rowsToRecord = <Row extends { key?: string }, T>(
  rows: Row[],
  existing: Record<string, T> | undefined,
  base: string,
  write: (row: Row, old: T | undefined) => T,
): Record<string, T> | undefined => {
  const taken = new Set([...Object.keys(existing ?? {}), ...rows.flatMap((r) => r.key ?? [])]);
  const entries = rows.map((row): [string, T] => {
    const old = row.key ? existing?.[row.key] : undefined;
    return [old ? row.key! : freshKey(taken, base), write(row, old)];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** Given name and surname in place of the old ones; titles, middle names … stay (§2.2.1). */
const nameFor = (form: ContactForm, old: ContactCard["name"]): ContactCard["name"] => {
  const person: NameComponent[] = [
    ...(form.given ? [{ kind: "given", value: form.given }] : []),
    ...(form.surname ? [{ kind: "surname", value: form.surname }] : []),
  ];
  if (!person.length) return form.company ? { full: form.company } : undefined;
  const isPerson = (c: NameComponent) => c.kind === "given" || c.kind === "surname";
  const components = old?.components ?? [];
  const at = Math.max(0, components.findIndex(isPerson));
  const others = components.filter((c) => !isPerson(c));
  // `full` would still read the old name, so it goes.
  const { full: _full, ...rest } = old ?? {};
  return {
    ...rest,
    components: [...others.slice(0, at), ...person, ...others.slice(at)],
    isOrdered: old?.isOrdered ?? true,
  };
};

type Address = NonNullable<ContactCard["addresses"]>[string];

/** The address components (§2.5.1) with the form's in their place; the region … stay. */
const addressFor = (form: ContactForm, before: ContactForm, old: Address | undefined) => {
  const fields: [string[], string][] = [
    [["name", "number"], form.street],
    [["postcode"], form.postcode],
    [["locality"], form.city],
    [["country"], form.country],
  ];
  if (fields.every(([, value]) => !value)) return undefined;
  const placed = new Set<string>();
  const place = (kinds: string[], value: string): NameComponent[] => {
    if (placed.has(kinds[0]!)) return [];
    placed.add(kinds[0]!);
    return value ? [{ kind: kinds[0]!, value }] : [];
  };
  const components = (old?.components ?? []).flatMap((c) => {
    const field = fields.find(([kinds]) => kinds.includes(c.kind));
    return field ? place(...field) : [c];
  });
  const missing = fields.flatMap(([kinds, value]) => place(kinds, value));
  const { full: _full, countryCode, ...rest } = old ?? {};
  return {
    ...rest,
    components: [...components, ...missing],
    // The code would name the old country.
    ...(countryCode && form.country === before.country ? { countryCode } : {}),
  };
};

/** A website without a scheme ("weber.de") gets https, a link needs a URI (§2.6.3). */
const websiteUri = (text: string) => (/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);

const partialDate = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return { "@type": "PartialDate" as const, year, month, day: date };
};

/**
 * The card properties to write for a form: for a new card all of them, for an existing one only
 * those whose fields changed. A property left without value is `undefined`, which removes it.
 */
export const formToCard = (
  input: ContactForm,
  existing?: ContactCard,
): Partial<ContactCard> & Record<string, unknown> => {
  const form = cleaned(input);
  const before = existing ? cleaned(toForm(existing)) : undefined;
  const changed = (...keys: (keyof ContactForm)[]) =>
    !before || keys.some((key) => JSON.stringify(form[key]) !== JSON.stringify(before[key]));
  const was = before ?? emptyContactForm;
  const nameChanged =
    changed("given", "surname") || (!form.given && !form.surname && changed("company"));
  return {
    ...(nameChanged ? { name: nameFor(form, existing?.name) } : {}),
    ...(changed("company", "department") && {
      organizations: withEntry(
        existing?.organizations,
        () => true,
        "o",
        (old) => {
          const units = [
            ...(form.department ? [{ ...old?.units?.[0], name: form.department }] : []),
            ...(old?.units?.slice(1) ?? []),
          ];
          if (!form.company && !units.length) return undefined;
          const { name: _name, units: _units, ...rest } = old ?? {};
          return {
            ...rest,
            ...(form.company ? { name: form.company } : {}),
            ...(units.length ? { units } : {}),
          };
        },
      ),
    }),
    ...(changed("jobTitle") && {
      titles: withEntry(existing?.titles, isJobTitle, "t", (old) =>
        form.jobTitle
          ? { "@type": "Title" as const, kind: "title", ...old, name: form.jobTitle }
          : undefined,
      ),
    }),
    ...(changed("emails") && {
      emails: rowsToRecord(form.emails, existing?.emails, "e", (row, old) => ({
        ...old,
        address: row.address,
        contexts: old?.contexts ?? { work: true },
      })),
    }),
    ...(changed("phones") && {
      phones: rowsToRecord(form.phones, existing?.phones, "p", (row, old) => ({
        ...old,
        number: row.number,
        ...(old && phoneKind(old) === row.kind ? {} : phoneKindProps[row.kind]),
      })),
    }),
    ...(changed("street", "postcode", "city", "country") && {
      addresses: withEntry(
        existing?.addresses,
        () => true,
        "a",
        (old) => addressFor(form, was, old),
      ),
    }),
    ...(changed("website") && {
      links: withEntry(existing?.links, isWebsite, "website", (old) =>
        form.website
          ? { "@type": "Link" as const, ...old, uri: websiteUri(form.website) }
          : undefined,
      ),
    }),
    ...(changed("birthday") && {
      anniversaries: withEntry(existing?.anniversaries, isBirth, "birth", (old) =>
        /^\d{4}-\d{2}-\d{2}$/.test(form.birthday)
          ? {
              "@type": "Anniversary" as const,
              ...old,
              kind: "birth",
              date: partialDate(form.birthday),
            }
          : undefined,
      ),
    }),
    ...(changed("note") && {
      notes: withEntry(
        existing?.notes,
        () => true,
        "n",
        (old) => (form.note ? { ...old, note: form.note } : undefined),
      ),
    }),
  };
};
