/**
 * Filling a text snippet as it is put into a mail. Kontext knows a few placeholders itself –
 * {Vorname} and {Name} of the first recipient, {Datum} of today, {Absender} for one's own name –
 * and every other {Wort} is an own field the writer is asked for ("Auftragsnummer?"). Pure.
 */
import { escapeHtml } from "./html";

/**
 * A placeholder: a word (or a few, "Termin am") in braces, starting with a letter. Kept short and
 * without `<`, `>`, `"` or braces, so it never reaches across HTML tags or attributes.
 */
const PLACEHOLDER = /\{(\p{L}[\p{L}\p{N} ._-]{0,39})\}/gu;

/** What fills the placeholders Kontext knows; everything about the moment of inserting. */
export type SnippetContext = {
  /** The first recipient's name, "" while there is none. */
  recipient: string;
  /** One's own name, as it goes out in From. */
  sender: string;
  today: Date;
  /** For the date: `LOCALE` (src/lib/locale.ts). */
  locale: string;
};

/** The placeholders Kontext fills itself, by their lower-case name: case is a typing slip here. */
const knownValues = (context: SnippetContext): Record<string, string> => {
  const name = context.recipient.trim();
  return {
    vorname: name.split(/\s+/)[0] ?? "",
    name,
    datum: new Intl.DateTimeFormat(context.locale, { dateStyle: "medium" }).format(context.today),
    absender: context.sender.trim(),
  };
};

/** The placeholders Kontext fills itself, as they are written in a snippet. */
export const KNOWN_PLACEHOLDERS = {
  first: "{Vorname}",
  full: "{Name}",
  date: "{Datum}",
  sender: "{Absender}",
} as const;

const KNOWN_FIELDS = new Set(
  Object.values(KNOWN_PLACEHOLDERS).map((known) => known.slice(1, -1).toLowerCase()),
);

/** The snippet's own fields, each once, in the order they first appear: what to ask for. */
export const snippetFields = (body: string): string[] => [
  ...new Set(
    [...body.matchAll(PLACEHOLDER)]
      .map((match) => match[1]!.trim())
      .filter((field) => field && !KNOWN_FIELDS.has(field.toLowerCase())),
  ),
];

/**
 * The snippet's HTML with every placeholder filled: Kontext's own from the context, the own
 * fields from the answers. Values are escaped, the HTML around them – paragraphs, links,
 * formatting – stays as it is. An own field without an answer stays visible as {Feld}.
 */
export const fillSnippet = (
  html: string,
  context: SnippetContext,
  answers: Record<string, string> = {},
): string => {
  const known = knownValues(context);
  return html.replace(PLACEHOLDER, (placeholder, raw: string) => {
    const field = raw.trim();
    const key = field.toLowerCase();
    // Own properties only: "{constructor}" is a field, not something every object has.
    if (Object.hasOwn(known, key)) return escapeHtml(known[key]!);
    return Object.hasOwn(answers, field) ? escapeHtml(answers[field]!) : placeholder;
  });
};
