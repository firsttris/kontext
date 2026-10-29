import { describe, expect, it } from "vitest";
import {
  type Alert,
  alertsOf,
  noticeDelay,
  reminderForKind,
  reminderMinutes,
  reminderOf,
  reminderTag,
  reminderWhen,
  TIMED_MINUTES,
} from "./reminders";

const alert = (offset: string, action = "display", relativeTo?: "start" | "end"): Alert => ({
  "@type": "Alert",
  trigger: { "@type": "OffsetTrigger", offset, ...(relativeTo ? { relativeTo } : {}) },
  action,
});

describe("reminderOf", () => {
  it("reads the offset before the start and how it reminds", () => {
    expect(reminderOf({ a: alert("-PT30M") })).toEqual({ minutes: 30, action: "display" });
    expect(reminderOf({ a: alert("-P1D", "email") })).toEqual({ minutes: 1440, action: "email" });
    expect(reminderOf({ a: alert("-P1W") })).toEqual({ minutes: 10080, action: "display" });
    expect(reminderOf({ a: alert("PT0S") })).toEqual({ minutes: 0, action: "display" });
    expect(reminderOf({ a: alert("PT9H") })).toEqual({ minutes: -540, action: "display" });
    expect(reminderOf({ a: alert("+PT9H") })).toEqual({ minutes: -540, action: "display" });
  });

  it("has none without alerts", () => {
    expect(reminderOf(undefined)).toBeNull();
    expect(reminderOf(null)).toBeNull();
    expect(reminderOf({})).toBeNull();
  });

  it("keeps what it cannot show: several, after the end, at a fixed time, unreadable", () => {
    expect(reminderOf({ a: alert("-PT15M"), b: alert("-P1D") })).toBe("kept");
    expect(reminderOf({ a: alert("-PT15M", "display", "end") })).toBe("kept");
    expect(reminderOf({ a: { trigger: { "@type": "AbsoluteTrigger" }, action: "display" } })).toBe(
      "kept",
    );
    expect(reminderOf({ a: alert("soon") })).toBe("kept");
    expect(reminderOf({ a: alert("P") })).toBe("kept");
    expect(reminderOf({ a: alert("PT") })).toBe("kept");
  });
});

describe("alertsOf", () => {
  it("writes one alert before the start, the way Stalwart reads it back", () => {
    expect(alertsOf({ minutes: 30, action: "email" })).toEqual({
      reminder: {
        "@type": "Alert",
        trigger: { "@type": "OffsetTrigger", offset: "-PT30M", relativeTo: "start" },
        action: "email",
      },
    });
    expect(alertsOf({ minutes: 0, action: "display" })?.reminder?.trigger?.offset).toBe("PT0S");
    expect(alertsOf({ minutes: -540, action: "display" })?.reminder?.trigger?.offset).toBe("PT9H");
    expect(alertsOf({ minutes: 2880, action: "display" })?.reminder?.trigger?.offset).toBe("-P2D");
  });

  it("keeps the key of the event's alert", () => {
    expect(
      Object.keys(alertsOf({ minutes: 15, action: "display" }, { k1: alert("-PT5M") })!),
    ).toEqual(["k1"]);
  });

  it("removes them for none and leaves them out for kept", () => {
    expect(alertsOf(null, { a: alert("-PT5M") })).toBeNull();
    expect(alertsOf("kept", { a: alert("-PT5M") })).toBeUndefined();
  });

  it("reads back what it wrote, for every choice", () => {
    for (const minutes of [...TIMED_MINUTES, -540, 900, 2340, 9540]) {
      expect(reminderOf(alertsOf({ minutes, action: "email" }))).toEqual({
        minutes,
        action: "email",
      });
    }
  });
});

describe("reminderForKind", () => {
  it("keeps a reminder when the appointment becomes all-day or gets a time", () => {
    expect(reminderForKind({ minutes: 15, action: "email" }, true)).toEqual({
      minutes: 900,
      action: "email",
    });
    expect(reminderForKind({ minutes: 900, action: "display" }, false)).toEqual({
      minutes: 15,
      action: "display",
    });
    expect(reminderForKind({ minutes: 1440, action: "display" }, false)).toEqual({
      minutes: 1440,
      action: "display",
    });
  });

  it("leaves none and kept alone", () => {
    expect(reminderForKind(null, true)).toBeNull();
    expect(reminderForKind("kept", false)).toBe("kept");
  });
});

describe("reminderMinutes", () => {
  it("offers the event's own offset next to the choices", () => {
    expect(reminderMinutes({ minutes: 20, action: "display" }, false)).toEqual([
      0, 5, 10, 15, 20, 30, 60, 120, 1440, 2880, 10080,
    ]);
    expect(reminderMinutes({ minutes: 15, action: "display" }, false)).toEqual(TIMED_MINUTES);
    expect(reminderMinutes(null, true)).toEqual([-540, 900, 2340, 9540]);
  });
});

describe("noticeDelay", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  const start = new Date("2026-10-24T11:00:00Z");

  it("is the time until the notice, within a day", () => {
    expect(noticeDelay(start, { a: alert("-PT30M") }, now)).toBe(30 * 60_000);
    expect(noticeDelay(start, { a: alert("-PT1H") }, now)).toBe(0);
    expect(noticeDelay(new Date("2026-10-25T11:00:00Z"), { a: alert("-PT1H") }, now)).toBe(
      86_400_000,
    );
  });

  it("is none when it passed, is further away, reminds by mail or there is none", () => {
    expect(noticeDelay(start, { a: alert("-PT2H") }, now)).toBeUndefined();
    expect(noticeDelay(new Date("2026-10-26T12:00:00Z"), { a: alert("-PT1H") }, now)).toBe(
      undefined,
    );
    expect(noticeDelay(start, { a: alert("-PT30M", "email") }, now)).toBeUndefined();
    expect(noticeDelay(start, null, now)).toBeUndefined();
  });
});

describe("reminderTag", () => {
  it("names the event and the date of a series", () => {
    expect(reminderTag("d", "i")).toBe("reminder-d/i");
    expect(reminderTag("d", "i", null)).toBe("reminder-d/i");
    expect(reminderTag("d", "i", "2026-10-29T10:00:00")).toBe("reminder-d/i/2026-10-29T10:00:00");
  });
});

describe("reminderWhen", () => {
  it("names day and time in the language, all day without the time", () => {
    const start = new Date("2026-10-29T13:00:00Z");
    expect(reminderWhen(start, false, "de-DE", "Europe/Berlin")).toBe("Do., 29.10., 14:00");
    expect(reminderWhen(new Date("2026-10-28T23:00:00Z"), true, "de-DE", "Europe/Berlin")).toBe(
      "Do., 29.10.",
    );
  });
});
