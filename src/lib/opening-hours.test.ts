import { describe, expect, it } from "vitest";
import { fromWeek, toWeek, usualWeek } from "./opening-hours";

describe("opening hours", () => {
  it("goes from rows to ranges and back", () => {
    const open = fromWeek(usualWeek());
    expect(open).toHaveLength(10);
    expect(open[0]).toEqual({ day: 1, from: "08:00", to: "12:00" });
    expect(open).not.toContainEqual(expect.objectContaining({ day: 0 }));
    const week = toWeek(open);
    expect(week[0]).toEqual({
      day: 1,
      open: true,
      first: { from: "08:00", to: "12:00" },
      second: { from: "13:00", to: "17:00" },
    });
    expect(week[6]).toMatchObject({ day: 0, open: false, second: null });
  });

  it("keeps a day with one range as one", () => {
    const week = toWeek([{ day: 6, from: "09:00", to: "12:00" }]);
    expect(week[5]).toEqual({
      day: 6,
      open: true,
      first: { from: "09:00", to: "12:00" },
      second: null,
    });
    expect(fromWeek(week)).toEqual([{ day: 6, from: "09:00", to: "12:00" }]);
  });
});
