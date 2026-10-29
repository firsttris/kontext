import { describe, expect, it } from "vitest";
import { entriesOn, monthLines, printMonth, printWeek, safeColor } from "./calendar-print";
import { addDays, type CalendarEvent, weekDays } from "./jscalendar";

const event = (
  title: string,
  start: string,
  duration: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: title,
  calendarIds: { b: true },
  title,
  start,
  timeZone: "Europe/Berlin",
  duration,
  ...extra,
});

describe("entriesOn", () => {
  it("lists all-day events first, then by time, with time, place and colour", () => {
    const entries = entriesOn(
      [
        event("Baubesprechung", "2026-10-28T10:00:00", "PT1H30M", {
          locations: { a: { name: "Hoffmann, Gartenweg 3" } },
          color: "#2563eb",
        }),
        event("Wartung", "2026-10-28T08:00:00", "PT1H"),
        event("Messe", "2026-10-28T00:00:00", "P1D", { showWithoutTime: true }),
        event("Morgen", "2026-10-29T08:00:00", "PT1H"),
      ],
      "2026-10-28",
    );
    expect(entries).toEqual([
      { title: "Messe", time: "", place: "", color: "#71717a", allDay: true },
      { title: "Wartung", time: "08:00–09:00", place: "", color: "#71717a", allDay: false },
      {
        title: "Baubesprechung",
        time: "10:00–11:30",
        place: "Hoffmann, Gartenweg 3",
        color: "#2563eb",
        allDay: false,
      },
    ]);
  });

  it("leaves the time open where an event goes on beyond the day", () => {
    const night = event("Notdienst", "2026-10-27T22:00:00", "PT36H");
    expect(entriesOn([night], "2026-10-27")[0]).toMatchObject({ time: "22:00–", allDay: false });
    // The whole day in the middle counts as all day.
    expect(entriesOn([night], "2026-10-28")[0]).toMatchObject({ time: "", allDay: true });
    expect(entriesOn([night], "2026-10-29")[0]).toMatchObject({ time: "–10:00", allDay: false });
    // Until midnight ends on the day.
    const late = event("Inventur", "2026-10-28T20:00:00", "PT4H");
    expect(entriesOn([late], "2026-10-28")[0]?.time).toBe("20:00–24:00");
  });

  it("names an event without a title with a dash", () => {
    expect(entriesOn([event(" ", "2026-10-28T08:00:00", "PT1H")], "2026-10-28")[0]?.title).toBe(
      "—",
    );
  });
});

describe("safeColor", () => {
  it("keeps hex codes and colour names, nothing that could leave the CSS value", () => {
    expect(safeColor("#0f766e")).toBe("#0f766e");
    expect(safeColor("teal")).toBe("teal");
    expect(safeColor("red;background:url(https://x.test)")).toBe("#71717a");
    expect(safeColor('"><script>')).toBe("#71717a");
    expect(safeColor(undefined)).toBe("#71717a");
  });
});

describe("printWeek", () => {
  it("gives every day of the week its events", () => {
    const days = weekDays("2026-10-28");
    const week = printWeek(days, [event("Wartung", "2026-10-28T08:00:00", "PT1H")]);
    expect(week.map((day) => day.day)).toEqual(days);
    expect(week[2]?.entries.map((entry) => entry.title)).toEqual(["Wartung"]);
    expect(week[0]?.entries).toEqual([]);
  });
});

describe("printMonth", () => {
  const grid = (first: string) => Array.from({ length: 42 }, (_, index) => addDays(first, index));

  it("leaves out the weeks without a day of the month", () => {
    // November 2026: Monday 26 October to Sunday 6 December, the sixth week is all December.
    const weeks = printMonth(grid("2026-10-26"), "2026-11", []);
    expect(weeks).toHaveLength(6);
    // February 2027 begins on a Monday: four weeks, the rest is March.
    expect(printMonth(grid("2027-02-01"), "2027-02", [])).toHaveLength(4);
    expect(weeks[0]?.[0]).toMatchObject({ day: "2026-10-26", inMonth: false });
    expect(weeks[0]?.[6]).toMatchObject({ day: "2026-11-01", inMonth: true });
  });

  it("cuts a full day to its lines, the last one saying how many more", () => {
    const busy = Array.from({ length: 9 }, (_, index) =>
      event(
        `Termin ${index + 1}`,
        `2026-11-10T${String(8 + index).padStart(2, "0")}:00:00`,
        "PT30M",
      ),
    );
    const weeks = printMonth(grid("2026-10-26"), "2026-11", busy);
    const day = weeks.flat().find((entry) => entry.day === "2026-11-10")!;
    expect(monthLines(6)).toBe(4);
    expect(monthLines(4)).toBe(6);
    expect(day.entries.map((entry) => entry.title)).toEqual(["Termin 1", "Termin 2", "Termin 3"]);
    expect(day.more).toBe(6);
  });
});
