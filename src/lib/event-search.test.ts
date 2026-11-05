import { describe, expect, it } from "vitest";
import { orderHits } from "./event-search";
import type { CalendarEvent } from "./jscalendar";

const event = (id: string, start: string, accountId = "a"): CalendarEvent => ({
  id,
  accountId,
  calendarIds: { c: true },
  title: id,
  start,
  timeZone: "Europe/Berlin",
  duration: "PT1H",
});

const now = new Date("2026-11-05T12:00:00+01:00");

describe("orderHits", () => {
  it("lists coming appointments soonest first, then past ones latest first", () => {
    const hits = [
      event("last-year", "2025-11-04T10:00:00"),
      event("next-week", "2026-11-12T10:00:00"),
      event("yesterday", "2026-11-04T10:00:00"),
      event("tomorrow", "2026-11-06T10:00:00"),
    ];
    expect(orderHits(hits, now).map((hit) => hit.id)).toEqual([
      "tomorrow",
      "next-week",
      "yesterday",
      "last-year",
    ]);
  });

  it("counts an appointment still running as coming", () => {
    const running = event("running", "2026-11-05T11:30:00");
    expect(orderHits([event("yesterday", "2026-11-04T10:00:00"), running], now)[0]).toBe(running);
  });

  it("keeps an event found in two calendars once, but the same id in two accounts twice", () => {
    const hits = [event("x", "2026-11-06T10:00:00"), event("x", "2026-11-06T10:00:00")];
    expect(orderHits(hits, now)).toHaveLength(1);
    expect(orderHits([...hits, event("x", "2026-11-06T10:00:00", "b")], now)).toHaveLength(2);
  });
});
