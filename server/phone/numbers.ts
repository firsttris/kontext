/**
 * Phone numbers in one form (E.164, "+497223123456"), so a caller's number finds the contact it
 * belongs to whatever way either was written ("07223 12 34 56", "+49 (0) 7223/123456",
 * "0049 7223 …"). German numbers by default; the Fritzbox delivers national ones. Pure.
 */

const DEFAULT_COUNTRY = "49";

/** Digits and a leading "+", without "(0)" after a country code, spaces, dashes or slashes. */
const clean = (raw: string): string => {
  const trimmed = raw.trim().replace(/\(0\)/g, "");
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return plus ? `+${digits}` : digits;
};

/**
 * The number in E.164, or null when it is not a phone number (too short, letters only, an
 * internal extension like "**610").
 */
export const toE164 = (raw: string, country = DEFAULT_COUNTRY): string | null => {
  if (/\*/.test(raw)) return null;
  const number = clean(raw);
  const e164 = number.startsWith("+")
    ? number
    : number.startsWith("00")
      ? `+${number.slice(2)}`
      : number.startsWith("0")
        ? `+${country}${number.slice(1)}`
        : null;
  // "+49 (0)7223 …" without the brackets: the trunk prefix 0 does not belong after the code.
  const own = e164?.replace(new RegExp(`^\\+${country}0`), `+${country}`) ?? null;
  return own && /^\+[1-9]\d{6,14}$/.test(own) ? own : null;
};

/** How the Fritzbox wants to dial it: national with 0, abroad with 00. */
export const toDialable = (e164: string, country = DEFAULT_COUNTRY): string =>
  e164.startsWith(`+${country}`) ? `0${e164.slice(country.length + 1)}` : `00${e164.slice(1)}`;

/** "+497223123456" → "07223 123456" for German numbers; others stay international. */
export const readableNumber = (number: string, country = DEFAULT_COUNTRY): string => {
  if (!number.startsWith(`+${country}`)) return number;
  const national = `0${number.slice(country.length + 1)}`;
  // Mobile numbers (015x–017x) after four digits, landlines after the area code is not known
  // here: a space after the first five keeps it readable without pretending to know.
  return `${national.slice(0, 5)} ${national.slice(5)}`;
};

/**
 * The ways a number may come from the Fritzbox – national, international with "+" or "00", or
 * without either – for matching it as delivered (the block list in the box).
 */
export const numberForms = (e164: string, country = DEFAULT_COUNTRY): string[] => {
  const digits = e164.slice(1);
  const national = e164.startsWith(`+${country}`) ? [`0${e164.slice(country.length + 1)}`] : [];
  return [e164, `00${digits}`, digits, ...national];
};

/** Two numbers that reach the same line. */
export const sameNumber = (a: string, b: string, country = DEFAULT_COUNTRY): boolean => {
  const left = toE164(a, country);
  return left !== null && left === toE164(b, country);
};
