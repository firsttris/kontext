import { describe, expect, it } from "vitest";
import { dayAndTime, duration, storage } from "./backup";

const now = new Date("2026-10-27T12:00:00+01:00");

describe("dayAndTime", () => {
  it("says today, yesterday and tomorrow, in Kontext's time zone", () => {
    expect(dayAndTime("2026-10-27T02:00:00Z", now)).toBe("heute 03:00");
    expect(dayAndTime("2026-10-26T02:00:00Z", now)).toBe("gestern 03:00");
    expect(dayAndTime("2026-10-28T02:00:00Z", now)).toBe("morgen 03:00");
  });
  it("names the day further away", () => {
    expect(dayAndTime("2026-10-23T01:00:00Z", now)).toBe("Fr., 23.10. 03:00");
  });
});

describe("duration", () => {
  it("in minutes and hours", () => {
    expect(duration("2026-10-27T02:00:00Z", "2026-10-27T02:00:20Z")).toBe("unter 1 Min");
    expect(duration("2026-10-27T02:00:00Z", "2026-10-27T02:04:10Z")).toBe("4 Min");
    expect(duration("2026-10-27T02:00:00Z", "2026-10-27T03:05:00Z")).toBe("1 Std 5 Min");
  });
});

describe("storage", () => {
  it("against 10 GB, over the warning or not", () => {
    expect(storage(5 * 1024 ** 3, 8)).toMatchObject({ share: 0.5, over: false });
    expect(storage(9 * 1024 ** 3, 8)).toMatchObject({ share: 0.9, over: true });
    expect(storage(30 * 1024 ** 3, 50)).toMatchObject({ share: 0.6, over: false });
  });
});
