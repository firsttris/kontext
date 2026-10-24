import { describe, expect, it } from "vitest";
import { holdUntil, sendChoices, validSendTime } from "./schedule";

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
