import { describe, expect, it } from "vitest";
import { CALENDAR_COLORS, calendarChanges } from "./calendar-colors";

describe("calendarChanges", () => {
  const shown = { name: "Baustellen", color: "#2563eb" };

  it("sends nothing when nothing changed", () => {
    expect(calendarChanges(shown, "Baustellen", "#2563eb")).toEqual({});
  });

  it("sends only the new name", () => {
    expect(calendarChanges(shown, "Montage", "#2563eb")).toEqual({ name: "Montage" });
  });

  it("sends only the new colour", () => {
    expect(calendarChanges(shown, "Baustellen", "#dc2626")).toEqual({ color: "#dc2626" });
  });

  it("keeps no colour stored when none was picked", () => {
    expect(calendarChanges(shown, "Montage", undefined)).toEqual({ name: "Montage" });
  });
});

describe("CALENDAR_COLORS", () => {
  it("are CSS hex colours, as Calendar/set takes them", () => {
    for (const { color } of CALENDAR_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
