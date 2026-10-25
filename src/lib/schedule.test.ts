import { describe, expect, it } from "vitest";
import { holdUntil, sendChoices, snoozeChoices, validSendTime } from "./schedule";

describe("sendChoices", () => {
  it("offers today, tomorrow and Monday morning by the time of day", () => {
    // Friday, 23 October 2026, 09:30 in Berlin.
    const morning = sendChoices(new Date("2026-10-23T07:30:00Z"));
    expect(morning.map((c) => c.label)).toEqual([
      "Heute 13:00",
      "Heute 17:00",
      "Morgen 08:00",
      "Montag 08:00",
    ]);
    expect(morning[0]!.at.toISOString()).toBe("2026-10-23T11:00:00.000Z");
    expect(morning[3]!.at.toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("leaves out what has passed, and Monday on a Sunday (that is tomorrow)", () => {
    // Sunday, 25 October 2026, 18:00 in Berlin (winter time).
    expect(sendChoices(new Date("2026-10-25T17:00:00Z")).map((c) => c.label)).toEqual([
      "Morgen 08:00",
    ]);
  });

  it("offers Monday morning as today on a Monday before eight, never beyond the 7 days", () => {
    // Monday, 26 October 2026, 07:00 in Berlin: next Monday 08:00 would be 7 days and 1 hour ahead.
    const now = new Date("2026-10-26T06:00:00Z");
    const choices = sendChoices(now);
    expect(choices.map((c) => c.label)).toEqual([
      "Heute 08:00",
      "Heute 13:00",
      "Heute 17:00",
      "Morgen 08:00",
    ]);
    expect(choices[0]!.at.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    expect(choices.every((c) => validSendTime(c.at, now))).toBe(true);
  });
});

describe("holdUntil and validSendTime", () => {
  it("writes UTC without fractions and keeps to what the server holds", () => {
    expect(holdUntil(new Date("2026-10-26T07:00:00.123Z"))).toBe("2026-10-26T07:00:00Z");
    const now = new Date("2026-10-24T12:00:00Z");
    expect(validSendTime(new Date("2026-10-24T11:00:00Z"), now)).toBe(false);
    expect(validSendTime(new Date("2026-10-26T07:00:00Z"), now)).toBe(true);
    expect(validSendTime(new Date("2026-12-24T07:00:00Z"), now)).toBe(false);
  });
});

describe("snoozeChoices", () => {
  it("adds a week from now in the morning", () => {
    // Sunday, 25 October 2026, 18:00 in Berlin: a week on is 1 November, after the clock change.
    const choices = snoozeChoices(new Date("2026-10-25T17:00:00Z"));
    expect(choices.map((c) => c.label)).toEqual(["Morgen 08:00", "In einer Woche 08:00"]);
    expect(choices[1]!.at.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});
