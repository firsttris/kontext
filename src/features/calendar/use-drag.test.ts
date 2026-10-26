import { describe, expect, it } from "vitest";
import { movePatch } from "@/lib/event-form";
import { type CalendarEvent, toLocal } from "@/lib/jscalendar";
import { droppedTimes } from "./use-drag";

const event = (start: string) =>
  ({
    id: "x",
    calendarIds: {},
    start,
    duration: "PT1H",
    timeZone: "Europe/Berlin",
  }) as CalendarEvent;

describe("droppedTimes on the day the clocks change", () => {
  it("ends a resized block at the 06:00 row it was pulled to on 25 October", () => {
    const { start, end } = droppedTimes(
      { id: "x", day: "2026-10-25", top: 0, height: 360 },
      "resize",
    );
    expect(toLocal(end)).toBe("2026-10-25T06:00:00");
    expect(movePatch(event("2026-10-25T00:00:00"), start, end)).toEqual({
      start: "2026-10-25T00:00:00",
      duration: "PT6H",
    });
  });
  it("ends a resized block at the 04:00 row it was pulled to on 29 March", () => {
    const { start, end } = droppedTimes(
      { id: "x", day: "2026-03-29", top: 60, height: 180 },
      "resize",
    );
    expect(toLocal(end)).toBe("2026-03-29T04:00:00");
    expect(movePatch(event("2026-03-29T01:00:00"), start, end)).toEqual({
      start: "2026-03-29T01:00:00",
      duration: "PT3H",
    });
  });
  it("keeps the length of a moved block", () => {
    const { start, end } = droppedTimes(
      { id: "x", day: "2026-10-20", top: 600, height: 90 },
      "move",
    );
    expect(end.getTime() - start.getTime()).toBe(90 * 60_000);
  });
});
