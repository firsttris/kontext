import { describe, expect, it } from "vitest";
import {
  addMeetingNote,
  attendeeEmails,
  eventToForm,
  formToEvent,
  meetingNote,
  movePatch,
  newEventForm,
  removeMeetingNote,
  seriesStart,
  validateEventForm,
  withStart,
} from "./event-form";
import {
  type CalendarEvent,
  durationMinutes,
  fromLocal,
  localDiff,
  shiftLocal,
  withAllDayOf,
} from "./jscalendar";

describe("forms", () => {
  const me = { email: "jonas@weber.test", name: "Jonas" };
  it("validates title and order", () => {
    expect(validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "" })).toBe("title");
    expect(
      validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "x", endTime: "09:00" }),
    ).toBe("order");
    expect(validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "x" })).toBe(null);
  });
  it("writes a timed event with attendees and reads it back", () => {
    const form = {
      ...newEventForm("2026-10-23T10:00:00", 90),
      title: "Baubesprechung",
      attendees: "anna@weber.test",
      location: "Werkstatt",
    };
    const written = formToEvent(form, me);
    expect(written).toMatchObject({
      title: "Baubesprechung",
      start: "2026-10-23T10:00:00",
      timeZone: "Europe/Berlin",
      duration: "PT1H30M",
      organizerCalendarAddress: "mailto:jonas@weber.test",
    });
    const read = eventToForm(
      { ...(written as unknown as CalendarEvent), id: "x", calendarIds: {} },
      [me.email],
    );
    expect(read).toMatchObject({
      date: "2026-10-23",
      startTime: "10:00",
      endTime: "11:30",
      attendees: "anna@weber.test",
      location: "Werkstatt",
    });
  });
  it("writes an all-day event over two days", () => {
    const form = {
      ...newEventForm("2026-10-23T00:00:00"),
      title: "Urlaub",
      allDay: true,
      endDate: "2026-10-24",
    };
    expect(formToEvent(form, me)).toMatchObject({
      start: "2026-10-23T00:00:00",
      duration: "P2D",
      showWithoutTime: true,
      participants: null,
    });
  });
  it("keeps an all-day event of the expanded query all-day when saved unchanged", () => {
    // As queryEvents gets it from Stalwart: an instance in the request's zone, flag from its base.
    const instance: CalendarEvent = {
      id: "h1pnmeaaaaac",
      calendarIds: { c: true },
      title: "Betriebsausflug",
      start: "2026-11-03T00:00:00",
      timeZone: "Europe/Berlin",
      duration: "P1D",
      baseEventId: "c",
      utcStart: "2026-11-02T23:00:00Z",
      utcEnd: "2026-11-03T23:00:00Z",
    };
    const loaded = withAllDayOf(new Map([["c", { showWithoutTime: true }]]))(instance);
    const form = eventToForm(loaded, [me.email]);
    expect({ allDay: form.allDay, endDate: form.endDate }).toEqual({
      allDay: true,
      endDate: "2026-11-03",
    });
    expect(formToEvent(form, me, loaded)).toMatchObject({
      showWithoutTime: true,
      timeZone: null,
      duration: "P1D",
    });
  });
  it("keeps an all-day event one day long when saved unchanged", () => {
    // As Stalwart returns it when floating times are resolved in UTC.
    const stored: CalendarEvent = {
      id: "j",
      calendarIds: { c: true },
      title: "Betriebsausflug",
      start: "2026-10-23T00:00:00",
      showWithoutTime: true,
      duration: "P1D",
      utcStart: "2026-10-23T00:00:00Z",
      utcEnd: "2026-10-24T00:00:00Z",
    };
    const form = eventToForm(stored, [me.email]);
    expect({ date: form.date, endDate: form.endDate }).toEqual({
      date: "2026-10-23",
      endDate: "2026-10-23",
    });
    expect(formToEvent(form, me).duration).toBe("P1D");
  });
});

describe("repeating", () => {
  const me = { email: "jonas@weber.test" };
  it("writes the rule only for the series", () => {
    const form = {
      ...newEventForm("2026-10-26T08:00:00", 30),
      title: "Wochenrunde",
      recurrence: {
        repeat: "weekly",
        repeatEnd: "count",
        repeatCount: 4,
        repeatUntil: "",
      } as const,
    };
    expect(formToEvent(form, me).recurrenceRule).toEqual({
      "@type": "RecurrenceRule",
      frequency: "weekly",
      count: 4,
    });
    expect(formToEvent(form, me, undefined, false)).not.toHaveProperty("recurrenceRule");
    expect(formToEvent(newEventForm("2026-10-26T08:00:00"), me).recurrenceRule).toBeNull();
  });
  it("reads the rule from the series, not from the instance", () => {
    const series = {
      id: "c",
      calendarIds: {},
      start: "2026-10-26T08:00:00",
      timeZone: "Europe/Berlin",
      recurrenceRule: { frequency: "daily", until: "2026-11-30T23:59:59" },
    } as CalendarEvent;
    const instance = {
      ...series,
      id: "i",
      start: "2026-11-02T08:00:00",
      recurrenceRule: null,
      baseEventId: "c",
    };
    expect(eventToForm(instance, [], series).recurrence).toEqual({
      repeat: "daily",
      repeatEnd: "until",
      repeatCount: 10,
      repeatUntil: "2026-11-30",
    });
  });
  it("wants an end date not before the start", () => {
    const form = {
      ...newEventForm("2026-10-26T08:00:00"),
      title: "x",
      recurrence: {
        repeat: "daily",
        repeatEnd: "until",
        repeatCount: 10,
        repeatUntil: "2026-10-01",
      } as const,
    };
    expect(validateEventForm(form)).toBe("repeatEnd");
  });
  it("moves the series by what an instance moved", () => {
    expect(shiftLocal("2026-10-26T08:00:00", 90)).toBe("2026-10-26T09:30:00");
    expect(localDiff("2026-11-02T08:00:00", "2026-11-03T09:00:00")).toBe(1500);
    // Across the end of summer time the wall clock stays the same.
    expect(seriesStart("2026-10-19T08:00:00", "2026-11-02T08:00:00", "2026-11-02T10:00:00")).toBe(
      "2026-10-19T10:00:00",
    );
  });
});

describe("movePatch", () => {
  it("keeps the event's own zone and a minimum length", () => {
    const event = {
      id: "x",
      calendarIds: {},
      start: "2026-10-23T10:00:00",
      timeZone: "Europe/Berlin",
    } as CalendarEvent;
    expect(movePatch(event, new Date("2026-10-24T07:15:00Z"))).toEqual({
      start: "2026-10-24T09:15:00",
    });
    expect(
      movePatch(event, new Date("2026-10-24T07:15:00Z"), new Date("2026-10-24T07:20:00Z")),
    ).toEqual({
      start: "2026-10-24T09:15:00",
      duration: "PT15M",
    });
  });
  it("writes the length on the wall clock across the clock change", () => {
    const event = {
      id: "x",
      calendarIds: {},
      start: "2026-10-24T22:00:00",
      timeZone: "Europe/Berlin",
    } as CalendarEvent;
    // Saturday 22:00 to Sunday 06:00 in Berlin on 24/25 October: 9 real hours, 8 on the clock.
    expect(
      movePatch(event, new Date("2026-10-24T20:00:00Z"), new Date("2026-10-25T05:00:00Z")),
    ).toEqual({ start: "2026-10-24T22:00:00", duration: "PT8H" });
  });
});

/**
 * utcEnd as Stalwart 0.16.27 computes it: the duration (a day as 86400 s, calcard 0.3.14
 * `as_seconds`) added to the local start on the wall clock, then resolved in the event's zone
 * (crates/groupware/src/calendar/dates.rs, expand.rs `resolve_local`).
 */
const stalwartUtcEnd = (start: string, duration: string, zone: string): string =>
  fromLocal(shiftLocal(start, durationMinutes(duration)), zone).toISOString();

describe("timed events across the clock change, saved and opened again", () => {
  const me = { email: "jonas@weber.test" };
  const reopenedEnd = (start: string, endDate: string, endTime: string) => {
    const form = { ...newEventForm(start), title: "Notdienst", endDate, endTime };
    const written = formToEvent(form, me) as { start: string; duration: string; timeZone: string };
    const stored = {
      ...(written as unknown as CalendarEvent),
      id: "x",
      calendarIds: {},
      utcStart: fromLocal(written.start, written.timeZone).toISOString(),
      utcEnd: stalwartUtcEnd(written.start, written.duration, written.timeZone),
    };
    const read = eventToForm(stored, [me.email]);
    return { duration: written.duration, end: `${read.endDate} ${read.endTime}` };
  };
  it("keeps Saturday 12:00 to Sunday 12:00 on 24/25 October one day long", () => {
    expect(reopenedEnd("2026-10-24T12:00:00", "2026-10-25", "12:00")).toEqual({
      duration: "P1D",
      end: "2026-10-25 12:00",
    });
  });
  it("keeps the end of an overnight shift on 24/25 October and 28/29 March", () => {
    expect(reopenedEnd("2026-10-24T22:00:00", "2026-10-25", "06:00").end).toBe("2026-10-25 06:00");
    expect(reopenedEnd("2026-03-28T22:00:00", "2026-03-29", "06:00").end).toBe("2026-03-29 06:00");
  });
  it("keeps the end of Saturday 12:00 to Sunday 11:30 on 24/25 October", () => {
    expect(reopenedEnd("2026-10-24T12:00:00", "2026-10-25", "11:30").end).toBe("2026-10-25 11:30");
  });
  it("writes the same durations as before away from the clock change", () => {
    const duration = (endDate: string, endTime: string) =>
      reopenedEnd("2026-10-20T10:00:00", endDate, endTime).duration;
    expect(duration("2026-10-20", "10:30")).toBe("PT30M");
    expect(duration("2026-10-21", "10:00")).toBe("P1D");
    expect(duration("2026-10-21", "12:00")).toBe("P1DT2H");
    expect(duration("2026-10-20", "10:00")).toBe("PT0S");
  });
});

describe("video meeting", () => {
  const me = { email: "jonas@weber.test" };
  const link = "https://kontext.weber.test/meet/AbCdEfGhIjKlMnOpQrSt_-";

  it("writes the link as an online place and reads it back", () => {
    const form = { ...newEventForm("2026-10-23T10:00:00"), title: "Abnahme", meeting: link };
    const written = formToEvent(form, me);
    expect(written.virtualLocations).toEqual({
      "kontext-meeting": {
        "@type": "VirtualLocation",
        name: "Videobesprechung",
        uri: link,
        features: { audio: true, video: true, screen: true },
      },
    });
    const read = eventToForm(
      { ...(written as unknown as CalendarEvent), id: "x", calendarIds: {} },
      [me.email],
    );
    expect(read.meeting).toBe(link);
  });

  it("keeps other online places and removes only its own", () => {
    const teams = { teams: { name: "Teams", uri: "https://teams.example/join/1" } };
    const existing = {
      id: "x",
      calendarIds: {},
      start: "2026-10-23T10:00:00",
      virtualLocations: { ...teams, "kontext-meeting": { uri: link } },
    } as CalendarEvent;
    const form = { ...eventToForm(existing, [me.email]), title: "Abnahme", meeting: "" };
    expect(formToEvent(form, me, existing).virtualLocations).toEqual(teams);
    const none = { ...newEventForm("2026-10-23T10:00:00"), title: "x" };
    expect(formToEvent(none, me).virtualLocations).toBeNull();
  });

  it("puts the link into the notes and takes it out again", () => {
    expect(addMeetingNote("", link)).toBe(meetingNote(link));
    const notes = addMeetingNote("Bitte Pläne mitbringen.", link);
    expect(notes).toBe(`Bitte Pläne mitbringen.\n\nVideobesprechung: ${link}`);
    expect(addMeetingNote(notes, link)).toBe(notes);
    expect(removeMeetingNote(notes, link)).toBe("Bitte Pläne mitbringen.");
  });
  it("writes whether the time counts as busy and reads it back", () => {
    const form = { ...newEventForm("2026-10-23T10:00:00"), title: "Urlaub planen" };
    expect(formToEvent(form, me).freeBusyStatus).toBe("busy");
    const free = formToEvent({ ...form, showAs: "free" }, me);
    expect(free.freeBusyStatus).toBe("free");
    const event = { id: "e", calendarIds: {}, ...free } as unknown as CalendarEvent;
    expect(eventToForm(event, []).showAs).toBe("free");
  });
});

describe("attendeeEmails", () => {
  it("reads the addresses of the chips, with or without a name", () => {
    expect(attendeeEmails('"Keller, Petra" <petra@keller.test>, anna@weber.test')).toEqual([
      "petra@keller.test",
      "anna@weber.test",
    ]);
  });
});

describe("withStart", () => {
  const form = newEventForm("2026-10-31T09:00:00", 90);

  it("moves the end with a new start time, keeping the length", () => {
    const moved = withStart(form, { startTime: "17:30" });
    expect([moved.date, moved.startTime, moved.endDate, moved.endTime]).toEqual([
      "2026-10-31",
      "17:30",
      "2026-10-31",
      "19:00",
    ]);
  });

  it("carries the end into the next day", () => {
    const moved = withStart(form, { startTime: "23:30" });
    expect([moved.endDate, moved.endTime]).toEqual(["2026-11-01", "01:00"]);
  });

  it("moves the end with a new date", () => {
    const moved = withStart(form, { date: "2026-11-02" });
    expect([moved.endDate, moved.endTime]).toEqual(["2026-11-02", "10:30"]);
  });

  it("keeps the days of an all-day event", () => {
    const allDay = { ...form, allDay: true, endDate: "2026-11-01" };
    expect(withStart(allDay, { date: "2026-11-05" }).endDate).toBe("2026-11-06");
  });

  it("gives an hour when the end was not after the start", () => {
    const broken = { ...form, endTime: "08:00" };
    expect(withStart(broken, { startTime: "17:30" }).endTime).toBe("18:30");
  });

  it("moves the end once a cleared start is whole again", () => {
    const cleared = withStart(form, { date: "" });
    const moved = withStart(cleared, { date: "2026-11-02" }, "2026-10-31T09:00");
    expect([moved.endDate, moved.endTime]).toEqual(["2026-11-02", "10:30"]);
    const time = withStart(
      withStart(form, { startTime: "" }),
      { startTime: "17:30" },
      "2026-10-31T09:00",
    );
    expect([time.endDate, time.endTime]).toEqual(["2026-10-31", "19:00"]);
  });

  it("changes only the start while a field is empty", () => {
    const moved = withStart(form, { startTime: "" });
    expect([moved.startTime, moved.endTime]).toEqual(["", "10:30"]);
  });
});
