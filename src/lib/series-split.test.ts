import { describe, expect, it } from "vitest";
import {
  endBefore,
  endSeriesPatch,
  followingRule,
  isFirstDate,
  overridesBefore,
} from "./series-split";

const weekly = { "@type": "RecurrenceRule" as const, frequency: "weekly" as const };

describe("isFirstDate", () => {
  it("is the series' own start", () => {
    expect(isFirstDate({ start: "2026-11-02T10:00:00" }, "2026-11-02T10:00:00")).toBe(true);
    expect(isFirstDate({ start: "2026-11-02T10:00:00" }, "2026-11-09T10:00:00")).toBe(false);
  });
});

describe("endBefore", () => {
  it("ends the series the minute before the date, instead of after a number or a day", () => {
    expect(endBefore(weekly, "2026-11-16T10:00:00")).toEqual({
      ...weekly,
      until: "2026-11-16T09:59:00",
    });
    expect(endBefore({ ...weekly, count: 10 }, "2026-11-16T10:00:00")).toEqual({
      ...weekly,
      until: "2026-11-16T09:59:00",
    });
    expect(
      endBefore({ ...weekly, until: "2027-01-01T00:00:00" }, "2026-11-16T10:00:00").until,
    ).toBe("2026-11-16T09:59:00");
  });

  it("ends an all-day series on the day before", () => {
    expect(endBefore(weekly, "2026-11-16T00:00:00").until).toBe("2026-11-15T23:59:00");
  });
});

describe("overridesBefore", () => {
  it("keeps the changes before the date, drops those from it on", () => {
    expect(
      overridesBefore(
        {
          "2026-11-09T10:00:00": { title: "Früher" },
          "2026-11-16T10:00:00": { excluded: true },
          "2026-11-23T10:00:00": { title: "Später" },
        },
        "2026-11-16T10:00:00",
      ),
    ).toEqual({ "2026-11-09T10:00:00": { title: "Früher" } });
    expect(overridesBefore({ "2026-11-23T10:00:00": {} }, "2026-11-16T10:00:00")).toBeNull();
    expect(overridesBefore(null, "2026-11-16T10:00:00")).toBeNull();
  });
});

describe("followingRule", () => {
  it("keeps the number of dates in all", () => {
    expect(followingRule({ ...weekly, count: 10 }, 3)).toEqual({ ...weekly, count: 7 });
    expect(followingRule({ ...weekly, count: 2 }, 5)).toEqual({ ...weekly, count: 1 });
    expect(followingRule(weekly, 3)).toEqual(weekly);
    expect(followingRule(null, 3)).toBeNull();
  });
});

describe("endSeriesPatch", () => {
  it("writes the shortened rule and the changes that stay", () => {
    expect(
      endSeriesPatch(
        {
          recurrenceRule: { ...weekly, count: 10 },
          recurrenceOverrides: { "2026-11-23T10:00:00": { title: "Später" } },
        },
        "2026-11-16T10:00:00",
      ),
    ).toEqual({
      recurrenceRule: { ...weekly, until: "2026-11-16T09:59:00" },
      recurrenceOverrides: null,
    });
  });
});
