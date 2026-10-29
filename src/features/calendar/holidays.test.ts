import { describe, expect, it } from "vitest";
import { holidayCalendarName, holidayEvent, holidayYears, missingHolidays } from "./holidays";

describe("holidays in the calendar", () => {
  it("names the calendar after the state", () => {
    expect(holidayCalendarName("BY")).toBe("Feiertage Bayern");
  });

  it("fills this year and the next", () => {
    expect(holidayYears("2026-10-29")).toEqual([2026, 2027]);
  });

  it("writes a free all-day event", () => {
    expect(holidayEvent({ day: "2026-12-25", name: "1. Weihnachtstag" })).toEqual({
      title: "1. Weihnachtstag",
      start: "2026-12-25T00:00:00",
      timeZone: null,
      showWithoutTime: true,
      duration: "P1D",
      freeBusyStatus: "free",
    });
  });

  it("adds only what is missing", () => {
    const all = missingHolidays("BW", [2026, 2027], []);
    expect(all).toHaveLength(24);
    const again = missingHolidays(
      "BW",
      [2026, 2027],
      [
        { start: "2026-12-25T00:00:00", title: "1. Weihnachtstag" },
        { start: "2026-12-26T00:00:00", title: "Eigener Termin" },
      ],
    );
    expect(again).toHaveLength(23);
    expect(again).not.toContainEqual({ day: "2026-12-25", name: "1. Weihnachtstag" });
  });
});
