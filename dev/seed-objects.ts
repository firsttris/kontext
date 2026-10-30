/**
 * The seed's contacts and events as JSContact cards (RFC 9553) and JSCalendar events (RFC 8984).
 * Pure and without Node APIs: dev/seed.ts sends them to Stalwart, the demo (src/demo) keeps them
 * in the browser. Dates are relative to `now`, so they are near whenever the seed runs.
 */
import { DEV_DOMAIN } from "./config";
import type { SeedContact, SeedContactGroup, SeedEvent } from "./seed-data";

/** Local date-time in Europe/Berlin for "today + days" at "HH:MM", as JSCalendar LocalDateTime. */
export const localStart = (days: number, time: string, now = Date.now()): string => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  // Days on the calendar, not 24 hours each: around a change of the clocks a day in Berlin has
  // 23 or 25 hours.
  const ymd = new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
  return `${ymd}T${time}:00`;
};

/** A PartialDate (RFC 9553 §2.8.1) `days` from today, with the year when the age is given. */
const birthAnniversary = ({ day, age }: { day: number; age?: number }, now: number) => {
  const [year, month, date] = localStart(day, "00:00", now).slice(0, 10).split("-").map(Number);
  return {
    "@type": "Anniversary",
    kind: "birth",
    date: {
      "@type": "PartialDate",
      ...(age === undefined ? {} : { year: year! - age }),
      month,
      day: date,
    },
  };
};

export const contactCard = (c: SeedContact, addressBookId: string, now = Date.now()) => ({
  "@type": "Card",
  version: "1.0",
  uid: c.uid,
  kind: "individual",
  addressBookIds: { [addressBookId]: true },
  name: {
    components: [
      { kind: "given", value: c.given },
      { kind: "surname", value: c.surname },
    ],
    isOrdered: true,
  },
  ...(c.company ? { organizations: { o: { name: c.company } } } : {}),
  ...(c.email ? { emails: { e: { address: c.email, contexts: { work: true } } } } : {}),
  ...(c.phone ? { phones: { p: { number: c.phone, features: { voice: true } } } } : {}),
  ...(c.street || c.city
    ? {
        addresses: {
          a: {
            components: [
              ...(c.street ? [{ kind: "name", value: c.street }] : []),
              ...(c.city ? [{ kind: "locality", value: c.city }] : []),
            ],
          },
        },
      }
    : {}),
  ...(c.note ? { notes: { n: { note: c.note } } } : {}),
  ...(c.birthday ? { anniversaries: { b: birthAnniversary(c.birthday, now) } } : {}),
});

export const groupCard = (group: SeedContactGroup, addressBookId: string) => ({
  "@type": "Card",
  version: "1.0",
  uid: group.uid,
  kind: "group",
  addressBookIds: { [addressBookId]: true },
  name: { full: group.name },
  members: Object.fromEntries(group.members.map((uid) => [uid, true])),
});

/** "PT1H30M" for 90 minutes. */
const duration = (minutes: number) =>
  `PT${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}H` : ""}${minutes % 60 ? `${minutes % 60}M` : ""}`;

/** The organizer and the attendees; colleagues are asked to reply, customers not. */
const participantsOf = (ownerEmail: string, attendees: string[]) => ({
  organizerCalendarAddress: `mailto:${ownerEmail}`,
  participants: {
    owner: {
      "@type": "Participant",
      calendarAddress: `mailto:${ownerEmail}`,
      roles: { owner: true, attendee: true },
      participationStatus: "accepted",
    },
    ...Object.fromEntries(
      attendees.map((address, index) => [
        `a${index}`,
        {
          "@type": "Participant",
          calendarAddress: `mailto:${address}`,
          roles: { attendee: true },
          participationStatus: "needs-action",
          // Colleagues get their invitation; a customer's (a .test domain without MX) would
          // only bounce into the organizer's inbox. Stalwart invites only who is expected to
          // reply (RSVP, `send_invite_messages` in crates/groupware/src/scheduling/mod.rs).
          expectReply: address.endsWith(`@${DEV_DOMAIN}`),
        },
      ]),
    ),
  },
});

export const calendarEvent = (e: SeedEvent, calendarId: string, now = Date.now()) => ({
  "@type": "Event",
  uid: e.uid,
  calendarIds: { [calendarId]: true },
  title: e.title,
  start: localStart(e.day, e.time, now),
  timeZone: "Europe/Berlin",
  duration: duration(e.minutes),
  ...(e.description ? { description: e.description } : {}),
  ...(e.recurrence ? { recurrenceRule: { "@type": "RecurrenceRule", ...e.recurrence } } : {}),
  ...(e.location ? { locations: { l: { "@type": "Location", name: e.location } } } : {}),
  ...(e.attendees?.length ? participantsOf(`${e.owner}@${DEV_DOMAIN}`, e.attendees) : {}),
});
