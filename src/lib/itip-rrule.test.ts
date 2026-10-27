import { describe, expect, it } from "vitest";
import { toICalendar } from "./itip";
import type { CalendarEvent } from "./jscalendar";

/**
 * A series made in a CalDAV client (Apple Calendar "monthly on the last weekday"), as Stalwart
 * returns it through JMAP (calcard maps BYSETPOS to bySetPosition, BYMONTH to byMonth).
 */
const series = {
  id: "e1",
  uid: "uid-1",
  sequence: 0,
  calendarIds: { c: true },
  title: "Monatsabschluss",
  start: "2026-11-30T09:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  participants: {
    o: { calendarAddress: "mailto:jonas@weber-haustechnik.test", roles: { attendee: true } },
    k: { calendarAddress: "mailto:markus@hoffmann.test", roles: { attendee: true } },
  },
  recurrenceRule: {
    "@type": "RecurrenceRule",
    frequency: "monthly",
    byDay: [{ day: "mo" }, { day: "tu" }, { day: "we" }, { day: "th" }, { day: "fr" }],
    bySetPosition: [-1],
  },
} as unknown as CalendarEvent;

/** The RRULE of the VEVENT (not of the VTIMEZONE), unfolded. */
const rruleOf = (ics: string) => {
  const lines = ics.replace(/\r\n /g, "").split("\r\n");
  return lines.slice(lines.indexOf("BEGIN:VEVENT")).find((line) => line.startsWith("RRULE:"));
};

describe("toICalendar: the series' rule", () => {
  it("keeps BYSETPOS, so the last weekday does not become every weekday", () => {
    const ics = toICalendar(series, { method: "REQUEST", now: new Date("2026-10-27T12:00:00Z") });
    expect(rruleOf(ics)).toContain("BYSETPOS=-1");
  });

  it("keeps BYMONTH of a yearly rule", () => {
    const yearly = {
      ...series,
      start: "2027-03-28T09:00:00",
      recurrenceRule: {
        "@type": "RecurrenceRule",
        frequency: "yearly",
        byMonth: ["3"],
        byDay: [{ day: "su", nthOfPeriod: -1 }],
      },
    } as unknown as CalendarEvent;
    const ics = toICalendar(yearly, { method: "REQUEST", now: new Date("2026-10-27T12:00:00Z") });
    const rule = rruleOf(ics);
    expect(rule).toContain("BYMONTH=3");
  });
});
