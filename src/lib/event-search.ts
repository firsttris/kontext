/** The order of found appointments: the coming ones soonest first, then the past ones latest first. */
import { type CalendarEvent, eventKey, eventTimes } from "./jscalendar";

/** Hits of several calendars as one list, each event once (one may be in two calendars). */
export const orderHits = (events: CalendarEvent[], now: Date): CalendarEvent[] => {
  const unique = [...new Map(events.map((event) => [eventKey(event), event])).values()];
  const startOf = (event: CalendarEvent) => eventTimes(event).start.getTime();
  const coming = unique.filter((event) => eventTimes(event).end >= now);
  const past = unique.filter((event) => eventTimes(event).end < now);
  return [
    ...coming.sort((a, b) => startOf(a) - startOf(b)),
    ...past.sort((a, b) => startOf(b) - startOf(a)),
  ];
};
