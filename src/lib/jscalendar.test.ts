import { describe, expect, it } from "vitest";
import {
  addDays,
  type CalendarEvent,
  durationMinutes,
  eventSpan,
  eventTimes,
  fromLocal,
  isMeetingLink,
  isoWeek,
  onDay,
  placeInColumns,
  toDuration,
  toLocal,
  weekDays,
  withAllDayOf,
} from "./jscalendar";

const event = (
  id: string,
  start: string,
  duration: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  calendarIds: { b: true },
  title: id,
  start,
  timeZone: "Europe/Berlin",
  duration,
  ...extra,
});

describe("time zones", () => {
  it("converts local Berlin time in summer and winter", () => {
    expect(fromLocal("2026-07-01T10:00:00").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(fromLocal("2026-12-01T10:00:00").toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(toLocal(new Date("2026-12-01T09:00:00Z"))).toBe("2026-12-01T10:00:00");
  });
  it("handles the night the clocks go back", () => {
    expect(fromLocal("2026-10-25T12:00:00").toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
  it("reads other zones", () => {
    expect(fromLocal("2026-07-01T10:00:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T14:00:00.000Z",
    );
  });
});

describe("durations", () => {
  it("parses and writes ISO durations", () => {
    expect(durationMinutes("PT1H30M")).toBe(90);
    expect(durationMinutes("P1D")).toBe(1440);
    expect(durationMinutes("P1W")).toBe(10080);
    expect(toDuration(90)).toBe("PT1H30M");
    expect(toDuration(1440)).toBe("P1D");
    expect(toDuration(30)).toBe("PT30M");
  });
});

describe("timed events across the clock change, as Stalwart reads them", () => {
  // Stalwart adds the duration to the local start on the wall clock, a day as 24 hours.
  it("ends P1D and PT24H from Saturday 12:00 on Sunday 12:00 without utcEnd", () => {
    const p1d = eventTimes(event("x", "2026-10-24T12:00:00", "P1D"));
    const pt24h = eventTimes(event("y", "2026-10-24T12:00:00", "PT24H"));
    expect(p1d.end.toISOString()).toBe("2026-10-25T11:00:00.000Z");
    expect(pt24h.end.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
  it("ends PT8H from Saturday 22:00 on Sunday 06:00 without utcEnd", () => {
    const { end } = eventTimes(event("z", "2026-10-24T22:00:00", "PT8H"));
    expect(toLocal(end)).toBe("2026-10-25T06:00:00");
  });
});

describe("weeks", () => {
  it("starts on Monday and counts ISO weeks", () => {
    expect(weekDays("2026-10-23")[0]).toBe("2026-10-19");
    expect(weekDays("2026-10-25")[6]).toBe("2026-10-25");
    expect(isoWeek("2026-10-23")).toBe(43);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

/** The timed events of one day, placed as in the week grid. */
const placeEvents = (events: CalendarEvent[], key: string) =>
  placeInColumns(events.map((e) => eventSpan(e, key)));

describe("placeInColumns", () => {
  it("puts overlapping events side by side", () => {
    const placed = placeEvents(
      [
        event("a", "2026-10-23T09:00:00", "PT1H"),
        event("b", "2026-10-23T09:30:00", "PT1H"),
        event("c", "2026-10-23T11:00:00", "PT30M"),
      ],
      "2026-10-23",
    );
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(byId.a).toMatchObject({ top: 540, height: 60, column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ top: 570, column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ top: 660, column: 0, columns: 1 });
  });
  it("places anything with a span, such as a task due at a time", () => {
    const placed = placeInColumns([
      { item: "event", top: 540, bottom: 600 },
      { item: "task", top: 570, bottom: 600 },
    ]);
    expect(placed).toEqual([
      { item: "event", top: 540, height: 60, column: 0, columns: 2 },
      { item: "task", top: 570, height: 30, column: 1, columns: 2 },
    ]);
  });
  it("cuts events that run past midnight", () => {
    const [placed] = placeEvents([event("n", "2026-10-23T23:00:00", "PT2H")], "2026-10-23");
    expect(placed).toMatchObject({ top: 1380, height: 60 });
  });
});

describe("onDay", () => {
  it("knows all-day events and multi-day spans", () => {
    const allDay = event("u", "2026-10-23T00:00:00", "P2D", {
      showWithoutTime: true,
      timeZone: null,
    });
    expect(onDay(allDay, "2026-10-23")).toBe(true);
    expect(onDay(allDay, "2026-10-24")).toBe(true);
    expect(onDay(allDay, "2026-10-25")).toBe(false);
    expect(eventTimes(allDay).allDay).toBe(true);
  });
  it("keeps an all-day event on its own day whatever zone the server resolved it in", () => {
    // Stalwart without a `timeZone` argument resolves floating times in UTC
    // (crates/jmap/src/calendar_event/get.rs): 00:00Z to 00:00Z is 02:00 to 02:00 in Berlin.
    const allDay = event("j", "2026-10-23T00:00:00", "P1D", {
      showWithoutTime: true,
      utcStart: "2026-10-23T00:00:00Z",
      utcEnd: "2026-10-24T00:00:00Z",
    });
    expect(onDay(allDay, "2026-10-23")).toBe(true);
    expect(onDay(allDay, "2026-10-24")).toBe(false);
  });
  it("ends all-day events at local midnight across the clock change", () => {
    const { start, end } = eventTimes(
      event("d", "2026-10-24T00:00:00", "P2D", { showWithoutTime: true, timeZone: null }),
    );
    expect(start.toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("withAllDayOf", () => {
  // A floating all-day event as Stalwart 0.16.27 returns it from the expanded query (checked
  // against a running server): a date-time in the request's zone, without showWithoutTime.
  const instance = event("h1pnmeaaaaac", "2026-11-03T00:00:00", "P1D", {
    baseEventId: "c",
    utcStart: "2026-11-02T23:00:00Z",
    utcEnd: "2026-11-03T23:00:00Z",
  });
  const bases = new Map([["c", { showWithoutTime: true }]]);

  it("gives an instance of an all-day event its flag and floating time back", () => {
    const restored = withAllDayOf(bases)(instance);
    expect(restored).toMatchObject({ showWithoutTime: true, timeZone: null });
    expect(onDay(restored, "2026-11-03")).toBe(true);
    expect(onDay(restored, "2026-11-04")).toBe(false);
  });
  it("leaves timed events and instances moved to a time of day alone", () => {
    expect(withAllDayOf(new Map([["c", {}]]))(instance)).toBe(instance);
    const moved = { ...instance, start: "2026-11-03T10:00:00" };
    expect(withAllDayOf(bases)(moved)).toBe(moved);
  });
});

describe("isMeetingLink", () => {
  it("takes Kontext's meeting links and nothing that only ends like one", () => {
    expect(isMeetingLink("https://kontext.weber.test/meet/AbCdEfGhIjKlMnOpQrSt_-")).toBe(true);
    expect(isMeetingLink("http://localhost:5173/meet/AbCdEfGhIjKlMnOp")).toBe(true);
    expect(isMeetingLink("javascript:alert(1)//x/meet/AAAAAAAAAAAAAAAA")).toBe(false);
    expect(isMeetingLink("data:text/html,x/meet/AAAAAAAAAAAAAAAA")).toBe(false);
  });
});
