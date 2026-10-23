import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  fromRecurrenceRule,
  NO_REPEAT,
  type RepeatForm,
  toRecurrenceRule,
} from "./recurrence";

const form = (patch: Partial<RepeatForm>): RepeatForm => ({ ...NO_REPEAT, ...patch });

describe("recurrence", () => {
  it("has no rule for a single event", () => {
    expect(toRecurrenceRule(NO_REPEAT)).toBeNull();
    expect(fromRecurrenceRule(null)).toEqual(NO_REPEAT);
  });
  it("round-trips every choice of the form", () => {
    for (const repeat of [
      "daily",
      "weekdays",
      "weekly",
      "biweekly",
      "monthly",
      "yearly",
    ] as const) {
      const choice = form({ repeat });
      expect(fromRecurrenceRule(toRecurrenceRule(choice))).toEqual(choice);
    }
    const counted = form({ repeat: "weekly", repeatEnd: "count", repeatCount: 4 });
    expect(fromRecurrenceRule(toRecurrenceRule(counted))).toEqual(counted);
    const until = form({ repeat: "monthly", repeatEnd: "until", repeatUntil: "2027-03-31" });
    expect(toRecurrenceRule(until)).toMatchObject({ until: "2027-03-31T23:59:59" });
    expect(fromRecurrenceRule(toRecurrenceRule(until))).toEqual(until);
  });
  it("writes workdays as Monday to Friday", () => {
    expect(toRecurrenceRule(form({ repeat: "weekdays" }))?.byDay?.map((d) => d.day)).toEqual([
      "mo",
      "tu",
      "we",
      "th",
      "fr",
    ]);
  });
  it("leaves rules from other apps alone", () => {
    expect(fromRecurrenceRule({ frequency: "monthly", interval: 3 })).toBeNull();
    expect(
      fromRecurrenceRule({ frequency: "monthly", byDay: [{ day: "fr", nthOfPeriod: -1 }] }),
    ).toBeNull();
    expect(fromRecurrenceRule({ frequency: "weekly", byDay: [{ day: "mo" }] })).toBeNull();
  });
  it("describes a rule in German", () => {
    expect(describeRecurrence({ frequency: "weekly", count: 4 })).toBe("Wöchentlich, 4-mal");
    expect(describeRecurrence({ frequency: "daily", until: "2026-11-30T23:59:59" })).toBe(
      "Täglich bis 30. November 2026",
    );
    expect(describeRecurrence({ frequency: "monthly", interval: 3 })).toBe("Wiederholt sich");
    expect(describeRecurrence(null)).toBeNull();
  });
});
