/**
 * Contacts from the rows of a CSV file: each column goes to a field of the contact form, guessed
 * from its header (the column names of Outlook's and Google's exports, German and English, and
 * of a customer list in Excel). The cards are written by `formToCard`, as in the editor. Pure.
 */
import { type ContactForm, emptyContactForm, formToCard, type PhoneKind } from "./contact-form";
import type { ContactCard } from "./jscontact";

type TextField = Exclude<keyof ContactForm, "emails" | "phones">;
export type CsvField = TextField | "email" | `phone:${PhoneKind}` | "skip";

/** Lower case, words only: "E-mail 2 Address" → "e mail 2 address". */
const normalize = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-zäöüß0-9]+/g, " ")
    .trim();

/** Outlook writes "Ort geschäftlich" or "Business City", Google "Address 1 - City". */
const place = (words: string) =>
  new RegExp(`^((business|home|other|address \\d) )?(${words})( (geschäftlich|privat|weitere))?$`);

/** In the order the form shows them; the first that matches a header wins. */
const HEADERS: [CsvField, RegExp][] = [
  ["given", /^(vorname|first name|given name)$/],
  ["surname", /^(nachname|last name|family name|surname)$/],
  ["company", /^(firma|firmenname|unternehmen|company|organi[sz]ation( \d)?( name)?)$/],
  ["department", /^(abteilung|department|organization \d department)$/],
  ["jobTitle", /^(position|funktion|job title|organization \d title)$/],
  ["email", /^e ?mail( \d)?( address| adresse| value)?$/],
  ["phone:mobile", /^(mobil|mobile|handy|mobiltelefon|mobile phone|mobilnummer|handynummer)$/],
  ["phone:fax", /^((business |home )?fax|telefax|fax (geschäftlich|privat)|geschäftlich fax)$/],
  ["phone:home", /^(home phone( \d)?|telefon privat( \d)?|privat telefon)$/],
  [
    "phone:work",
    /^(telefon|telefonnummer|tel|phone|business phone( \d)?|primary phone|company main phone|telefon (geschäftlich|firma)( \d)?|geschäftlich telefon|phone \d value)$/,
  ],
  ["street", place("straße|strasse|street|anschrift")],
  ["postcode", place("plz|postleitzahl|zip|zip code|postal code|postcode")],
  ["city", place("ort|stadt|city")],
  ["country", place("land|country|land region|country region")],
  ["website", /^(website|webseite|web page|web site|homepage|internet|url|website \d value)$/],
  ["birthday", /^(geburtstag|geburtsdatum|birthday)$/],
  ["note", /^(notiz|notizen|note|notes|bemerkung|bemerkungen|anmerkung)$/],
];

export const CSV_FIELDS: CsvField[] = [...HEADERS.map(([field]) => field), "skip"];

export const guessField = (header: string): CsvField =>
  HEADERS.find(([, pattern]) => pattern.test(normalize(header)))?.[0] ?? "skip";

const pad = (n: string) => n.padStart(2, "0");

/** "YYYY-MM-DD" from ISO, German "24.12.1980" or Outlook's US "12/24/1980"; else "". */
export const csvDate = (text: string): string => {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [iso[1]!, iso[2]!, iso[3]!]
    : german
      ? [german[3]!, german[2]!, german[1]!]
      : us
        ? [us[3]!, us[1]!, us[2]!]
        : [];
  return year && Number(month) >= 1 && Number(day) >= 1
    ? `${year}-${pad(month!)}-${pad(day!)}`
    : "";
};

/** The form for one row: mails and numbers add up, a text field keeps its first value. */
export const rowToForm = (row: string[], mapping: CsvField[]): ContactForm => {
  const form: ContactForm = { ...emptyContactForm, emails: [], phones: [] };
  mapping.forEach((field, i) => {
    const value = row[i]?.trim() ?? "";
    if (!value || field === "skip") return;
    if (field === "email") form.emails.push({ address: value });
    else if (field.startsWith("phone:"))
      form.phones.push({ number: value, kind: field.slice("phone:".length) as PhoneKind });
    else {
      const text = field as TextField;
      form[text] ||= text === "birthday" ? csvDate(value) : value;
    }
  });
  return form;
};

/** The cards for the rows; a row without name, company and mail is left out. */
export const csvCards = (rows: string[][], mapping: CsvField[]): ContactCard[] =>
  rows
    .map((row) => rowToForm(row, mapping))
    .filter((form) => form.given || form.surname || form.company || form.emails.length)
    .map((form) => ({ kind: "individual", ...formToCard(form) }) as ContactCard);
