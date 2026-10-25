import { describe, expect, it } from "vitest";
import {
  type Busy,
  dayBars,
  freeSlots,
  mergeBusy,
  type Schedule,
  statusDuring,
  withoutEvent,
} from "./availability";
import { fromLocal } from "./jscalendar";

/** Local time on Tuesday 27 October 2026 (Europe/Berlin), or another day. */
const at = (time: string, day = "2026-10-27") => fromLocal(`${day}T${time}:00`).getTime();
const busy = (from: string, to: string, status: Busy["status"] = "confirmed", day?: string) => ({
  start: at(from, day),
  end: at(to, day),
  status,
});

const anna: Schedule = {
  email: "anna@weber.test",
  busy: [busy("09:00", "11:30"), busy("15:00", "16:00", "tentative")],
};
const max: Schedule = { email: "max@weber.test", busy: [busy("14:00", "17:00")] };
const guest: Schedule = { email: "kunde@example.test", busy: null };

describe("availability", () => {
  it("tells free, busy until when, tentative and unknown apart", () => {
    expect(statusDuring(anna.busy, at("10:00"), at("11:00"))).toEqual({
      kind: "busy",
      until: at("11:30"),
      tentative: false,
    });
    expect(statusDuring(anna.busy, at("15:30"), at("16:30"))).toMatchObject({ tentative: true });
    expect(statusDuring(anna.busy, at("11:30"), at("12:00"))).toEqual({ kind: "free" });
    expect(statusDuring(guest.busy, at("10:00"), at("11:00"))).toEqual({ kind: "unknown" });
  });

  it("joins overlapping and touching periods", () => {
    const merged = mergeBusy([
      { email: "a", busy: [busy("09:00", "10:00"), busy("13:00", "14:00")] },
      { email: "b", busy: [busy("09:30", "11:00"), busy("11:00", "11:30")] },
    ]);
    expect(merged).toEqual([
      { start: at("09:00"), end: at("11:30") },
      { start: at("13:00"), end: at("14:00") },
    ]);
  });

  it("suggests the next hours in which everyone is free, inside the working day", () => {
    const slots = freeSlots([anna, max, guest], at("10:00"), 60);
    expect(slots).toEqual([
      { start: at("11:30"), end: at("12:30") },
      { start: at("12:30"), end: at("13:30") },
      { start: at("17:00"), end: at("18:00") },
    ]);
  });

  it("skips the weekend and starts on the half hour", () => {
    // Friday 30 October, 17:10: nothing fits that day, Saturday and Sunday are off.
    const slots = freeSlots([], at("17:10", "2026-10-30"), 60, { limit: 1 });
    expect(slots).toEqual([{ start: at("07:00", "2026-11-02"), end: at("08:00", "2026-11-02") }]);
  });

  it("places the busy periods of a day as parts of the hours shown", () => {
    const bars = dayBars(anna.busy!, "2026-10-27", { startHour: 7, endHour: 18 });
    expect(bars).toHaveLength(2);
    expect(bars[0]!.left).toBeCloseTo(2 / 11);
    expect(bars[0]!.width).toBeCloseTo(2.5 / 11);
    expect(bars[1]!.status).toBe("tentative");
    expect(dayBars(anna.busy!, "2026-10-28", { startHour: 7, endHour: 18 })).toEqual([]);
  });

  it("leaves out the appointment being edited", () => {
    const [annaWithout, guestWithout] = withoutEvent([anna, guest], {
      start: at("09:00"),
      end: at("11:30"),
    });
    expect(annaWithout!.busy).toHaveLength(1);
    expect(guestWithout!.busy).toBeNull();
    expect(withoutEvent([anna], null)[0]).toBe(anna);
  });
});
