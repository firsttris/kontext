import { describe, expect, it } from "vitest";
import { eventStartShort } from "./event-when";

describe("eventStartShort", () => {
  it("shows a timed start in the app's zone", () => {
    const utc = eventStartShort({ start: "2026-11-05T08:00:00", timeZone: "Etc/UTC" });
    const berlin = eventStartShort({ start: "2026-11-05T09:00:00", timeZone: "Europe/Berlin" });
    expect(utc).toBe(berlin);
    expect(berlin).toContain("09:00");
    expect(berlin).toContain("2026");
  });

  it("shows an all-day one as its date, without a time", () => {
    const day = eventStartShort({ start: "2026-11-20T00:00:00", showWithoutTime: true });
    expect(day).toContain("20");
    expect(day).not.toContain(":");
  });
});
