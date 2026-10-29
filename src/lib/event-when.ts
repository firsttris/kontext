/**
 * When an event is, in words, in the event's own zone and naming it: "Freitag, 20. November
 * 2026, 10:00–11:00 Uhr (Mitteleuropäische Normalzeit)". For invitations, which reach people in
 * other places, and the page on which they answer. Pure.
 */
import { m } from "@/paraglide/messages";
import {
  addDays,
  type CalendarEvent,
  durationMinutes,
  fromLocal,
  shiftLocal,
  ZONE,
} from "./jscalendar";
import { LOCALE } from "./locale";

const dayIn = (zone: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  });

const timeIn = (zone: string) =>
  new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: zone });

/** "Mitteleuropäische Sommerzeit" at that instant; the zone's id if Intl has no name for it. */
const zoneName = (zone: string, at: Date) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: zone, timeZoneName: "long" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value ?? zone;

/** An all-day date written as a day, read in UTC so it stays that day everywhere. */
const plainDay = (key: string) => dayIn("UTC").format(new Date(`${key}T12:00:00Z`));

export const eventWhen = (
  event: Pick<CalendarEvent, "start" | "duration" | "timeZone" | "showWithoutTime">,
): string => {
  const minutes = durationMinutes(event.duration);
  if (event.showWithoutTime) {
    const first = event.start.slice(0, 10);
    const days = Math.max(1, Math.ceil(minutes / 1440));
    const last = addDays(first, days - 1);
    return first === last
      ? m.invitation_when_all_day({ day: plainDay(first) })
      : m.invitation_when_days({ from: plainDay(first), to: plainDay(last) });
  }
  const zone = event.timeZone || ZONE;
  const start = fromLocal(event.start, zone);
  const end = fromLocal(shiftLocal(event.start, minutes), zone);
  const days = dayIn(zone);
  const times = timeIn(zone);
  const sameDay = days.format(start) === days.format(end);
  return sameDay
    ? m.invitation_when({
        day: days.format(start),
        from: times.format(start),
        to: times.format(end),
        zone: zoneName(zone, start),
      })
    : m.invitation_when_span({
        from: `${days.format(start)}, ${times.format(start)}`,
        to: `${days.format(end)}, ${times.format(end)}`,
        zone: zoneName(zone, start),
      });
};

const shortDay = (zone: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: zone,
  });

/**
 * The start in a line of a list, in the app's zone like the calendar shows it: "Do., 5. Nov.
 * 2026, 09:00"; an all-day one as its date alone.
 */
export const eventStartShort = (
  event: Pick<CalendarEvent, "start" | "timeZone" | "showWithoutTime">,
): string => {
  if (event.showWithoutTime) {
    return shortDay("UTC").format(new Date(`${event.start.slice(0, 10)}T12:00:00Z`));
  }
  const start = fromLocal(event.start, event.timeZone);
  return `${shortDay(ZONE).format(start)}, ${timeIn(ZONE).format(start)}`;
};
