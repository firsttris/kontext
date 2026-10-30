import { describe, expect, it } from "vitest";
import { hiddenToMove } from "./calendar-visibility";

const calendars = [
  { key: "a:1", visible: true },
  { key: "a:2", visible: false },
  { key: "b:7", visible: true },
];

describe("hiddenToMove", () => {
  it("moves what this device hid onto the server once, and leaves the app's own toggles", () => {
    expect(
      hiddenToMove(new Set(["a:1", "a:2", "birthdays", "tasks", "gone:9"]), calendars),
    ).toEqual({ hide: ["a:1"], forget: ["a:1", "a:2"] });
  });

  it("does nothing when the device hid no calendar", () => {
    expect(hiddenToMove(new Set(["birthdays"]), calendars)).toEqual({ hide: [], forget: [] });
  });
});
