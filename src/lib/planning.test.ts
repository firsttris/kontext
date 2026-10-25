import { describe, expect, it } from "vitest";
import { newEventForm } from "./event-form";
import { fromLocal } from "./jscalendar";
import { clock, formAt, formSlot, shownHours, slotLabel, whenLabel } from "./planning";

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
});
