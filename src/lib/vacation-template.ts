/**
 * Vorlagen for the out-of-office reply, kept by the Firmenverwaltung: {Name}, {Bis} and
 * {Vertretung} are filled when one is picked. Like the company signature
 * (server/company/signature.ts), a line whose placeholder has no value goes – no end date, no
 * deputy: no "bis ." and no "wenden Sie sich an ." – and like the snippets
 * (src/lib/snippet-fill.ts) the braces are matched without regard to case. Pure.
 */

export type VacationTemplate = { title: string; text: string };

/** As many and as long as the server keeps them (server/company/vacation-templates.ts). */
export const VACATION_TEMPLATES_MAX = 20;
export const VACATION_TITLE_MAX = 80;
export const VACATION_TEXT_MAX = 5000;

/** The placeholders, as they are written in a template. */
export const VACATION_PLACEHOLDERS = {
  name: "{Name}",
  to: "{Bis}",
  deputy: "{Vertretung}",
} as const;

export type VacationValues = {
  /** The absent person's name. */
  name: string;
  /** The last day away (YYYY-MM-DD), "" while open. */
  to: string;
  deputy: { name: string; email: string } | null;
  /** For the date: `LOCALE` (src/lib/locale.ts). */
  locale: string;
};

const PLACEHOLDER = /\{(name|bis|vertretung)\}/giu;

/** Whether the template names the deputy itself; otherwise the form adds the own line. */
export const namesDeputy = (text: string): boolean => /\{vertretung\}/iu.test(text);

/** How {Vertretung} is written in the text. */
export const deputyText = (deputy: { name: string; email: string }): string =>
  `${deputy.name} (${deputy.email})`;

/** A calendar day, written in the language; through UTC, so no time zone moves it. */
const longDate = (day: string, locale: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
};

const valuesOf = ({ name, to, deputy, locale }: VacationValues): Record<string, string> => ({
  name: name.trim(),
  bis: to ? longDate(to, locale) : "",
  vertretung: deputy ? deputyText(deputy) : "",
});

/** The template's text for this absence. */
export const fillVacationTemplate = (text: string, values: VacationValues): string => {
  const known = valuesOf(values);
  const value = (raw: string) => known[raw.toLowerCase()] ?? "";
  return text
    .split("\n")
    .filter((line) => [...line.matchAll(PLACEHOLDER)].every((match) => value(match[1]!)))
    .map((line) => line.replace(PLACEHOLDER, (_, raw: string) => value(raw)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
