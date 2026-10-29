/**
 * The birthday calendar: the contacts' birthdays (JSContact `anniversaries` of kind "birth",
 * RFC 9553 §2.8.1) as all-day events in a range of days. Computed in the browser from the address
 * books the user can see; nothing is stored on the server, so it is read-only and always matches
 * the cards. Pure; days are "YYYY-MM-DD".
 */
import type { CalendarEvent } from "./jscalendar";
import { type ContactCard, fullName } from "./jscontact";

/** A birth date; without a year when the card only knows the day (vCard `BDAY:--0504`). */
export type BirthDate = { year?: number; month: number; day: number };

/** Which card a birthday belongs to (card ids are only unique within an account). */
export type ContactRef = { accountId: string; id: string };

export type Birthday = { day: string; name: string; age?: number; contact: ContactRef };

/** A birthday as an event in the views; `contact` is what a click opens. */
export type BirthdayEvent = CalendarEvent & { contact: ContactRef };

const pad = (n: number): string => String(n).padStart(2, "0");

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** A real day of the calendar (no 31 April); 29 February in any year, placed by `dayIn`. */
const validDay = (month: number, day: number): boolean =>
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= new Date(Date.UTC(2000, month, 0)).getUTCDate();

/**
 * The card's birth date: a PartialDate (with or without its year) or a Timestamp, whose date in
 * UTC counts. Undefined without one, or when month or day is missing.
 */
export const birthDate = (card: Pick<ContactCard, "anniversaries">): BirthDate | undefined => {
  const birth = Object.values(card.anniversaries ?? {}).find((entry) => entry.kind === "birth");
  if (!birth?.date) return undefined;
  const parts =
    "utc" in birth.date
      ? /^(\d{4})-(\d{2})-(\d{2})/.exec(birth.date.utc)?.slice(1).map(Number)
      : [birth.date.year, birth.date.month, birth.date.day];
  const [year, month, day] = parts ?? [];
  if (month === undefined || day === undefined || !validDay(month, day)) return undefined;
  return year === undefined ? { month, day } : { year, month, day };
};

/** The day of the birthday in a year; 29 February falls on the 28th when the year has none. */
export const birthdayIn = (year: number, date: BirthDate): string => {
  const day = date.month === 2 && date.day === 29 && !isLeapYear(year) ? 28 : date.day;
  return `${year}-${pad(date.month)}-${pad(day)}`;
};

const yearsBetween = (from: string, to: string): number[] => {
  const first = Number(from.slice(0, 4));
  return Array.from({ length: Number(to.slice(0, 4)) - first + 1 }, (_, i) => first + i);
};

/** The birthdays of a card from `from` to `to` (inclusive), none before the year of birth. */
const birthdaysOf = (
  card: ContactCard & { accountId: string },
  from: string,
  to: string,
): Birthday[] => {
  const date = card.kind === "group" ? undefined : birthDate(card);
  if (!date) return [];
  const name = fullName(card);
  const contact = { accountId: card.accountId, id: card.id };
  return yearsBetween(from, to)
    .filter((year) => date.year === undefined || year >= date.year)
    .map((year) => ({ day: birthdayIn(year, date), age: date.year ? year - date.year : 0 }))
    .filter(({ day }) => day >= from && day <= to)
    .map(({ day, age }) => (age > 0 ? { day, name, age, contact } : { day, name, contact }));
};

/** The name as a person reads it: copies typed with other case or spaces are the same name. */
const sameNameKey = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/**
 * The birthdays of the cards from `from` to `to` (inclusive), by day and name. A person in two
 * address books (their own and a shared one) is shown once: same name on the same day, whatever
 * the case and spaces.
 */
export const birthdaysBetween = (
  cards: (ContactCard & { accountId: string })[],
  from: string,
  to: string,
): Birthday[] => {
  const seen = new Set<string>();
  return cards
    .flatMap((card) => birthdaysOf(card, from, to))
    .filter((birthday) => {
      const key = `${birthday.day} ${sameNameKey(birthday.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
};

/** "Petra Keller (52)": the age the person turns, when the year of birth is known. */
export const birthdayTitle = (birthday: Pick<Birthday, "name" | "age">): string =>
  birthday.age ? `${birthday.name} (${birthday.age})` : birthday.name;

/** All-day and free, in no calendar of the server; its id only has to be unique in the views. */
export const birthdayEvent = (birthday: Birthday, color: string): BirthdayEvent => ({
  id: `birthday-${birthday.contact.id}-${birthday.day}`,
  accountId: birthday.contact.accountId,
  color,
  calendarIds: {},
  title: birthdayTitle(birthday),
  start: `${birthday.day}T00:00:00`,
  timeZone: null,
  showWithoutTime: true,
  duration: "P1D",
  freeBusyStatus: "free",
  contact: birthday.contact,
});

export const isBirthday = (event: CalendarEvent): event is BirthdayEvent => "contact" in event;
