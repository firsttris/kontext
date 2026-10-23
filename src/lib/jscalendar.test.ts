import { describe, expect, it } from "vitest";
import {
  addDays,
  type CalendarEvent,
  durationMinutes,
  eventTimes,
  fromLocal,
  isoWeek,
  layoutDay,
  onDay,
  toDuration,
  toLocal,
  weekDays,
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

describe("weeks", () => {
  it("starts on Monday and counts ISO weeks", () => {
    expect(weekDays("2026-10-23")[0]).toBe("2026-10-19");
    expect(weekDays("2026-10-25")[6]).toBe("2026-10-25");
    expect(isoWeek("2026-10-23")).toBe(43);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("layoutDay", () => {
  it("puts overlapping events side by side", () => {
    const placed = layoutDay(
      [
        event("a", "2026-10-23T09:00:00", "PT1H"),
        event("b", "2026-10-23T09:30:00", "PT1H"),
        event("c", "2026-10-23T11:00:00", "PT30M"),
      ],
      "2026-10-23",
    );
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]));
    expect(byId.a).toMatchObject({ top: 540, height: 60, column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ top: 570, column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ top: 660, column: 0, columns: 1 });
  });
  it("cuts events that run past midnight", () => {
    const [placed] = layoutDay([event("n", "2026-10-23T23:00:00", "PT2H")], "2026-10-23");
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
});
