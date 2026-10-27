import { describe, expect, it } from "vitest";
import { applyPatch, toICalendar } from "./itip";
import type { CalendarEvent } from "./jscalendar";

const NOW = new Date("2026-10-27T12:00:00Z");

const meeting: CalendarEvent = {
  id: "e1",
  uid: "4f1c-abnahme",
  sequence: 2,
  calendarIds: { b: true },
  title: "Abnahme Bad, Hoffmann",
  description: "Bitte Fliesenmuster mitbringen.\nZweite Zeile",
  start: "2026-11-20T15:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H30M",
  locations: { l: { name: "Hauptstraße 41; Ettlingen" } },
  virtualLocations: {
    v: { name: "Videobesprechung", uri: "https://kontext.firma.de/meet/abcdefghijklmnop" },
  },
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  participants: {
    o: {
      name: "Jonas Weber",
      calendarAddress: "mailto:jonas@weber-haustechnik.test",
      roles: { owner: true, attendee: true },
    },
    a: {
      name: "Anna Weber",
      calendarAddress: "mailto:anna@weber-haustechnik.test",
      roles: { attendee: true },
      participationStatus: "accepted",
      expectReply: true,
    },
    k: {
      calendarAddress: "mailto:markus@hoffmann.test",
      roles: { attendee: true },
      participationStatus: "needs-action",
      expectReply: true,
    },
  },
};

/** The lines of one component, unfolded. */
const linesOf = (ics: string, begin = "BEGIN:VEVENT") => {
  const all = ics.replace(/\r\n /g, "").split("\r\n");
  const from = all.indexOf(begin);
  return all.slice(from, all.indexOf(begin.replace("BEGIN", "END"), from) + 1);
};

describe("toICalendar", () => {
  it("writes a REQUEST with organizer, attendees and their answers", () => {
    const ics = toICalendar(meeting, { method: "REQUEST", now: NOW });
    expect(ics).toMatch(
      /^BEGIN:VCALENDAR\r\nPRODID:-\/\/Kontext\/\/Kalender\/\/DE\r\nVERSION:2.0\r\n/,
    );
    expect(ics).toContain("\r\nMETHOD:REQUEST\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(linesOf(ics)).toEqual([
      "BEGIN:VEVENT",
      "UID:4f1c-abnahme",
      "SEQUENCE:2",
      "DTSTAMP:20261027T120000Z",
      "STATUS:CONFIRMED",
      "DTSTART;TZID=Europe/Berlin:20261120T150000",
      "DTEND;TZID=Europe/Berlin:20261120T163000",
      "SUMMARY:Abnahme Bad\\, Hoffmann",
      "DESCRIPTION:Bitte Fliesenmuster mitbringen.\\nZweite Zeile",
      "LOCATION:Hauptstraße 41\\; Ettlingen",
      "CONFERENCE;VALUE=URI;FEATURE=VIDEO;LABEL=Videobesprechung:https://kontext.firma.de/meet/abcdefghijklmnop",
      "TRANSP:OPAQUE",
      "ORGANIZER;CN=Jonas Weber:mailto:jonas@weber-haustechnik.test",
      "ATTENDEE;CN=Jonas Weber;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:jonas@weber-haustechnik.test",
      "ATTENDEE;CN=Anna Weber;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:anna@weber-haustechnik.test",
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:markus@hoffmann.test",
      "END:VEVENT",
    ]);
  });

  it("names the zone it uses in a VTIMEZONE", () => {
    const zone = linesOf(toICalendar(meeting, { method: "REQUEST", now: NOW }), "BEGIN:VTIMEZONE");
    expect(zone[1]).toBe("TZID:Europe/Berlin");
    expect(zone).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const ics = toICalendar({ ...meeting, title: "Ä".repeat(60) }, { method: "REQUEST", now: NOW });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(linesOf(ics)).toContain(`SUMMARY:${"Ä".repeat(60)}`);
  });

  it("writes times in UTC for UTC and without zone for floating ones", () => {
    const utc = linesOf(
      toICalendar({ ...meeting, timeZone: "Etc/UTC" }, { method: "REQUEST", now: NOW }),
    );
    expect(utc).toContain("DTSTART:20261120T150000Z");
    const floating = toICalendar({ ...meeting, timeZone: null }, { method: "REQUEST", now: NOW });
    expect(linesOf(floating)).toContain("DTSTART:20261120T150000");
    expect(floating).not.toContain("VTIMEZONE");
  });

  it("writes an all-day event as dates, the end the day after", () => {
    const ics = toICalendar(
      { ...meeting, start: "2026-12-24T00:00:00", duration: "P2D", showWithoutTime: true },
      { method: "REQUEST", now: NOW },
    );
    const lines = linesOf(ics);
    expect(lines).toContain("DTSTART;VALUE=DATE:20261224");
    expect(lines).toContain("DTEND;VALUE=DATE:20261226");
    expect(ics).not.toContain("VTIMEZONE");
  });

  it("writes a series with its rule, excluded and changed dates", () => {
    const series: CalendarEvent = {
      ...meeting,
      start: "2026-11-02T09:00:00",
      duration: "PT30M",
      recurrenceRule: {
        frequency: "weekly",
        interval: 2,
        byDay: [{ day: "mo" }],
        until: "2027-03-29T09:00:00",
      },
      recurrenceOverrides: {
        "2026-11-16T09:00:00": { excluded: true },
        "2026-11-30T09:00:00": {
          start: "2026-11-30T11:00:00",
          title: "Teambesprechung (später)",
          "participants/a/participationStatus": "declined",
        },
      },
    };
    const ics = toICalendar(series, { method: "REQUEST", now: NOW });
    const main = linesOf(ics);
    // In winter 09:00 in Berlin is 08:00 UTC.
    expect(main).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20270329T070000Z");
    expect(main).toContain("EXDATE;TZID=Europe/Berlin:20261116T090000");
    const changed = linesOf(ics.slice(ics.indexOf("END:VEVENT") + 10));
    expect(changed).toContain("RECURRENCE-ID;TZID=Europe/Berlin:20261130T090000");
    expect(changed).toContain("DTSTART;TZID=Europe/Berlin:20261130T110000");
    expect(changed).toContain("SUMMARY:Teambesprechung (später)");
    expect(changed.some((line) => line.includes("PARTSTAT=DECLINED"))).toBe(true);
    expect(changed.some((line) => line.startsWith("RRULE"))).toBe(false);
  });

  it("writes UNTIL of an all-day series as a date and a count as it is", () => {
    const allDay = { ...meeting, start: "2026-11-02T00:00:00", showWithoutTime: true };
    expect(
      linesOf(
        toICalendar(
          { ...allDay, recurrenceRule: { frequency: "yearly", until: "2030-11-02T00:00:00" } },
          { method: "REQUEST", now: NOW },
        ),
      ),
    ).toContain("RRULE:FREQ=YEARLY;UNTIL=20301102");
    expect(
      linesOf(
        toICalendar(
          {
            ...meeting,
            recurrenceRule: {
              frequency: "monthly",
              byDay: [{ day: "fr", nthOfPeriod: -1 }],
              count: 6,
            },
          },
          { method: "REQUEST", now: NOW },
        ),
      ),
    ).toContain("RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=6");
  });

  it("writes a CANCEL for everyone, and one for those taken off alone", () => {
    const all = toICalendar(meeting, { method: "CANCEL", now: NOW });
    expect(all).toContain("\r\nMETHOD:CANCEL\r\n");
    expect(linesOf(all)).toContain("STATUS:CANCELLED");
    expect(all.match(/^ATTENDEE/gm)).toHaveLength(3);

    const one = linesOf(
      toICalendar(meeting, { method: "CANCEL", now: NOW, only: ["Markus@Hoffmann.test"] }),
    );
    const attendees = one.filter((line) => line.startsWith("ATTENDEE"));
    expect(attendees).toHaveLength(2);
    expect(attendees[1]).toContain("mailto:markus@hoffmann.test");
    expect(attendees.some((line) => line.includes("anna@"))).toBe(false);
  });

  it("leaves the changed dates out of a CANCEL", () => {
    const series: CalendarEvent = {
      ...meeting,
      recurrenceRule: { frequency: "weekly" },
      recurrenceOverrides: { "2026-11-27T15:00:00": { title: "Anders" } },
    };
    const ics = toICalendar(series, { method: "CANCEL", now: NOW });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("starts the sequence at 0 and keeps links to documents", () => {
    const ics = linesOf(
      toICalendar(
        {
          ...meeting,
          sequence: undefined,
          links: { d: { href: "https://dokumente.firma.de/f/1", title: "Angebot.pdf" } },
        },
        { method: "REQUEST", now: NOW },
      ),
    );
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain(
      "LINK;LINKREL=related;VALUE=URI;LABEL=Angebot.pdf:https://dokumente.firma.de/f/1",
    );
  });
});

describe("applyPatch", () => {
  it("sets, replaces and removes by path, without touching the base", () => {
    const base = {
      title: "A",
      participants: { a: { name: "Anna", participationStatus: "accepted" } },
      x: 1,
    };
    const patched = applyPatch(base, {
      title: "B",
      "participants/a/participationStatus": "declined",
      x: null,
    });
    expect(patched).toEqual({
      title: "B",
      participants: { a: { name: "Anna", participationStatus: "declined" } },
    });
    expect(base.participants.a.participationStatus).toBe("accepted");
  });
});

describe("toICalendar: zones without one yearly rule", () => {
  it("lists the clock changes over the whole series, not only around its start", () => {
    // Israel's summer time starts on the Friday before the last Sunday in March: no BYDAY rule
    // of RFC 5545 fits, so each change is listed.
    const series: CalendarEvent = {
      ...meeting,
      start: "2026-11-05T09:00:00",
      timeZone: "Asia/Jerusalem",
      recurrenceRule: { frequency: "weekly", until: "2031-12-31T09:00:00" },
    };
    const zone = linesOf(toICalendar(series, { method: "REQUEST", now: NOW }), "BEGIN:VTIMEZONE");
    const starts = zone
      .filter((line) => line.startsWith("DTSTART:"))
      .map((line) => line.slice(8, 12));
    expect(starts).toContain("2030");
    expect(starts).toContain("2031");
  });
});
