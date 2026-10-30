import { describe, expect, it } from "vitest";
import { occurrences } from "./recurrence";

describe("occurrences", () => {
  it("counts weekly dates from the first", () => {
    expect(
      occurrences("2026-11-02T07:30:00", { frequency: "weekly", count: 3 }, "2027-01-01T00:00:00"),
    ).toEqual(["2026-11-02T07:30:00", "2026-11-09T07:30:00", "2026-11-16T07:30:00"]);
  });

  it("takes the chosen weekdays, and stops at the last day asked for", () => {
    const weekdays = ["mo", "tu", "we", "th", "fr"].map((day) => ({ day }));
    expect(
      occurrences(
        "2026-10-29T08:00:00",
        { frequency: "weekly", byDay: weekdays },
        "2026-11-03T00:00:00",
      ),
    ).toEqual(["2026-10-29T08:00:00", "2026-10-30T08:00:00", "2026-11-02T08:00:00"]);
  });

  it("skips months without the day, and ends at until", () => {
    expect(
      occurrences(
        "2027-01-31T10:00:00",
        { frequency: "monthly", until: "2027-05-01T00:00:00" },
        "2030-01-01T00:00:00",
      ),
    ).toEqual(["2027-01-31T10:00:00", "2027-03-31T10:00:00"]);
  });

  it("goes every second week", () => {
    expect(
      occurrences(
        "2026-11-02T09:00:00",
        { frequency: "weekly", interval: 2, count: 2 },
        "2027-01-01T00:00:00",
      ),
    ).toEqual(["2026-11-02T09:00:00", "2026-11-16T09:00:00"]);
  });
});
