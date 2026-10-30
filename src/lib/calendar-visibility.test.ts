import { describe, expect, it } from "vitest";
import { hiddenToMove, withOwnVisibility } from "./calendar-visibility";

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

describe("withOwnVisibility", () => {
  it("sends the person's own isVisible with every change, so Stalwart cannot hand them another member's", () => {
    expect(withOwnVisibility({ color: "#16a34a" }, true)).toEqual({
      color: "#16a34a",
      isVisible: true,
    });
    expect(withOwnVisibility({ shareWith: {} }, false)).toEqual({
      shareWith: {},
      isVisible: false,
    });
    expect(withOwnVisibility({ isVisible: false }, true)).toEqual({ isVisible: false });
  });
});
