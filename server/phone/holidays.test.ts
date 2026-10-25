import { describe, expect, it } from "vitest";
import { comingHolidays, easterSunday, holidaysBW } from "./holidays";

describe("holidays in Baden-Württemberg", () => {
  it("finds Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2000)).toBe("2000-04-23");
  });

  it("has the twelve days, the movable ones from Easter", () => {
    const days = holidaysBW(2026);
    expect(days).toHaveLength(12);
    expect(days).toContainEqual({ day: "2026-04-03", name: "Karfreitag" });
    expect(days).toContainEqual({ day: "2026-05-14", name: "Christi Himmelfahrt" });
    expect(days).toContainEqual({ day: "2026-05-25", name: "Pfingstmontag" });
    expect(days).toContainEqual({ day: "2026-06-04", name: "Fronleichnam" });
  });

  it("lists the coming year from today", () => {
    const coming = comingHolidays("2026-10-25");
    expect(coming[0]).toEqual({ day: "2026-11-01", name: "Allerheiligen" });
    expect(coming.at(-1)).toEqual({ day: "2027-10-03", name: "Tag der Deutschen Einheit" });
  });
});
