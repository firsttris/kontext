/**
 * The company signature: one template for everybody, with [Name] and [E-Mail] filled in per
 * sender address (Identity, RFC 8621 §6), and [Telefon], [Mobil], [Position], [Abteilung] from
 * what each person entered for it. A line whose placeholder stays empty goes, so nobody's
 * signature reads "Mobil:" with nothing after it. Pure functions.
 */
import type { Identity } from "./mailstore";

export type SignatureTemplate = { html: string; text: string };

/** What a person entered for the signature (Einstellungen → Profil). */
export type SignatureDetails = {
  phone: string;
  mobile: string;
  position: string;
  department: string;
};

export const NO_DETAILS: SignatureDetails = { phone: "", mobile: "", position: "", department: "" };

type Values = SignatureDetails & { name: string; email: string };

const PLACEHOLDERS: [string, keyof Values][] = [
  ["[Name]", "name"],
  ["[E-Mail]", "email"],
  ["[Telefon]", "phone"],
  ["[Mobil]", "mobile"],
  ["[Position]", "position"],
  ["[Abteilung]", "department"],
];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether a line names a placeholder that has no value. */
const lacksValue = (line: string, values: Values) =>
  PLACEHOLDERS.some(([placeholder, key]) => line.includes(placeholder) && !values[key].trim());

const KEYS = new Map(PLACEHOLDERS);
const ANY_PLACEHOLDER = new RegExp(
  PLACEHOLDERS.map(([placeholder]) => placeholder.replace(/[[\]]/g, "\\$&")).join("|"),
  "g",
);

/** In one pass and through a function, so a value goes in as it is: no "$&", no placeholder. */
const fill = (line: string, values: Values) =>
  line.replace(ANY_PLACEHOLDER, (placeholder) => values[KEYS.get(placeholder) as keyof Values]);

export const fillText = (template: string, values: Values): string =>
  template
    .split("\n")
    .filter((line) => !lacksValue(line, values))
    .map((line) => fill(line, values))
    .join("\n");

/** Marks where a line went, so only what that leaves empty goes, not a blank line on purpose. */
const GONE = "\u0000";

/** Empty elements, as long as there are, within what is left of a line that went. */
const withoutEmpty = (html: string) => {
  let before = "";
  let after = html;
  while (after !== before) {
    before = after;
    after = after.replace(/<([a-z][a-z0-9]*)\b[^>]*>\s*<\/\1>/gi, "");
  }
  return after;
};

/** A table row without a table inside, and a table left without rows. */
const ROW = /<tr\b[^>]*>(?:(?!<\/?(?:tr|table)\b)[\s\S])*<\/tr>/gi;
const ROWLESS_TABLE =
  /<table\b[^>]*>\s*(?:<colgroup\b[^>]*>[\s\S]*?<\/colgroup>)?\s*(?:<tbody\b[^>]*>\s*<\/tbody>)?\s*<\/table>/gi;

/**
 * In a table a row is the line ("Telefon | [Telefon]"): it goes as a whole, label cell and all,
 * and so does a table that loses every row.
 */
const withoutEmptyRows = (html: string, values: Values) =>
  html.replace(ROW, (row) => (lacksValue(row, values) ? "" : row)).replace(ROWLESS_TABLE, "");

/**
 * HTML lines end with <br> or a closing block such as a paragraph (as the editor writes them). A
 * line without a value loses its text and its <br>; what it leaves empty goes too: its bold or
 * link, the <br> before it at a paragraph's end, a paragraph of nothing but such lines.
 */
export const fillHtml = (template: string, values: Values): string => {
  const escaped = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]),
  ) as Values;
  // Every block the editor writes (StarterKit: headings, quotes, lists, code, rules) ends a line,
  // or a heading before a line that goes would go with it.
  const lines = withoutEmptyRows(template, values).split(
    /(?<=<br\s*\/?>|<hr\s*\/?>|<\/(?:p|div|li|h[1-6]|blockquote|pre|ul|ol|table|tr|td|th)>)/i,
  );
  const kept = lines.map((line) =>
    lacksValue(line, values)
      ? `${GONE}${withoutEmpty((line.match(/<(?!br\b)[^>]*>/gi) ?? []).join(""))}${GONE}`
      : fill(line, escaped),
  );
  return kept
    .join("")
    .replace(
      new RegExp(
        `<br\\s*/?>(?=${GONE}+(?:</(?:p|div|li)>)?${GONE}*$|${GONE}+</(?:p|div|li)>)`,
        "gi",
      ),
      "",
    )
    .replace(
      new RegExp(`<(p|div|li)\\b[^>]*>(?:\\s|${GONE})*${GONE}(?:\\s|${GONE})*</\\1>`, "gi"),
      "",
    )
    .replaceAll(GONE, "");
};

/** The signature patches for all of one account's sender addresses. */
export const signaturePatches = (
  template: SignatureTemplate,
  identities: Identity[],
  details: SignatureDetails = NO_DETAILS,
): Record<string, Partial<Identity>> =>
  Object.fromEntries(
    identities.map((identity) => {
      const values = { ...details, name: identity.name, email: identity.email };
      return [
        identity.id,
        {
          htmlSignature: fillHtml(template.html, values),
          textSignature: fillText(template.text, values),
        },
      ];
    }),
  );
