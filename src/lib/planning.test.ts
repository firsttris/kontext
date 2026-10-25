import { describe, expect, it } from "vitest";
import { newEventForm } from "./event-form";
import { fromLocal } from "./jscalendar";
import {
  clock,
  formAt,
  formSlot,
  planningRange,
  shownHours,
  slotLabel,
  whenLabel,
} from "./planning";

const at = (local: string) => fromLocal(local).getTime();

describe("planning", () => {
  const form = newEventForm("2026-10-27T10:00:00");

  it("reads the chosen time of a timed form only", () => {
    expect(formSlot(form)).toEqual({
      start: at("2026-10-27T10:00:00"),
      end: at("2026-10-27T11:00:00"),
    });
    expect(formSlot({ ...form, allDay: true })).toBeNull();
    expect(formSlot({ ...form, endTime: "09:00" })).toBeNull();
  });

  it("moves the form to a suggested time and keeps the rest", () => {
    const moved = formAt(
      { ...form, title: "Baubesprechung" },
      { start: at("2026-10-28T09:00:00"), end: at("2026-10-28T10:00:00") },
    );
    expect(moved).toMatchObject({
      title: "Baubesprechung",
      date: "2026-10-28",
      startTime: "09:00",
      endDate: "2026-10-28",
      endTime: "10:00",
    });
  });

  it("names a time by weekday, with the date when it is another day", () => {
    const slot = { start: at("2026-10-28T09:00:00"), end: at("2026-10-28T10:00:00") };
    expect(clock(slot.start)).toBe("09:00");
    expect(slotLabel(slot, "2026-10-28")).toBe("Mi 09:00–10:00");
    expect(slotLabel(slot, "2026-10-27")).toBe("Mi 28.10. 09:00–10:00");
    expect(whenLabel(slot.end, "2026-10-28")).toBe("10:00");
    expect(whenLabel(slot.end, "2026-10-27")).toBe("Mi 28.10. 10:00");
  });

  it("widens the hours shown to a time outside the working day", () => {
    expect(shownHours(null, "2026-10-27")).toMatchObject({ startHour: 7, endHour: 18 });
    const evening = { start: at("2026-10-27T18:30:00"), end: at("2026-10-27T19:30:00") };
    expect(shownHours(evening, "2026-10-27")).toMatchObject({ startHour: 7, endHour: 20 });
    expect(shownHours(evening, "2026-10-28")).toMatchObject({ startHour: 7, endHour: 18 });
  });
  it("loads the busy times for the days shown and the whole time the suggestions look at", () => {
    const now = at("2026-10-25T09:00:00");
    // An appointment three weeks ago: suggestions start now and look two weeks ahead.
    const old = planningRange("2026-10-05", "2026-10-05", now);
    expect(old.suggestFrom).toBe(now);
    expect(old.from).toBe(at("2026-10-05T00:00:00"));
    // freeSlots looks at the 14 days from today on, the last one ending before 8 November.
    expect(old.to).toBe(at("2026-11-08T00:00:00"));
    // Next week: from that day on.
    const next = planningRange("2026-11-04", "2026-11-03", now);
    expect(next.from).toBe(at("2026-11-03T00:00:00"));
    expect(next.suggestFrom).toBe(at("2026-11-04T00:00:00"));
    expect(next.to).toBe(at("2026-11-18T00:00:00"));
  });
});
