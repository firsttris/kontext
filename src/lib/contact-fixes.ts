/**
 * The "korrigieren" half of "Zusammenführen und korrigieren": names typed all in capitals or all
 * in small letters ("MAX MUSTERMANN", "petra keller", often from a business card scanner or an
 * old phone) are offered in the usual spelling.
 */
import { NAME_PARTICLES } from "./correspondent";
import { type ContactCard, company, fullName } from "./jscontact";

const isUpper = (text: string): boolean =>
  /\p{L}{2}/u.test(text) && text === text.toLocaleUpperCase("de");
const isLower = (text: string): boolean =>
  /\p{L}/u.test(text) && text === text.toLocaleLowerCase("de");

/**
 * "MÜLLER-LÜDENSCHEIDT" → "Müller-Lüdenscheidt", "anna von der heide" → "Anna von der Heide":
 * every word and every part of a double name starts with a capital, name particles after the
 * first word of the whole name stay small. `startsName` is false for a part after the first,
 * like the surname "von der heide" after the given name.
 */
export const nameCase = (text: string, startsName = true): string =>
  text
    .split(/(\s+)/)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("de");
      if ((index > 0 || !startsName) && NAME_PARTICLES.has(lower)) return lower;
      return lower.replace(
        /(^|[-'’])(\p{L})/gu,
        (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase("de")}`,
      );
    })
    .join("");

export type NameFix<T> = { card: T; before: string; after: string; name: ContactCard["name"] };

/**
 * The fix for a card's name, if it needs one. Company names are left as they are: capitals are
 * often right there ("BAUHAUS", "ABC Bau GmbH").
 */
export const nameFix = <T extends ContactCard>(card: T): NameFix<T> | undefined => {
  if (card.kind === "group" || !card.name) return undefined;
  const { components, full } = card.name;
  const onlyCompany = !components?.length && full === company(card);
  const before = fullName(card);
  if (onlyCompany || !(isUpper(before) || isLower(before))) return undefined;
  const name = {
    ...card.name,
    ...(components
      ? {
          components: components.map((c, index) => ({
            ...c,
            value: nameCase(c.value, index === 0),
          })),
        }
      : {}),
    ...(full ? { full: nameCase(full) } : {}),
  };
  const after = fullName({ ...card, name });
  return after === before ? undefined : { card, before, after, name };
};

/** The cards whose names could be spelled better. */
export const nameFixes = <T extends ContactCard>(cards: T[]): NameFix<T>[] =>
  cards.flatMap((card) => {
    const fix = nameFix(card);
    return fix ? [fix] : [];
  });
