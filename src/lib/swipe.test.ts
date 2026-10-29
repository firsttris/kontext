import { describe, expect, it } from "vitest";
import {
  actionOnRelease,
  DEFAULT_SWIPES,
  directionOf,
  isSwipe,
  offsetFor,
  readSwipeSettings,
} from "./swipe";

describe("isSwipe", () => {
  it("is a clear move sideways, not scrolling", () => {
    expect(isSwipe(20, 3)).toBe(true);
    expect(isSwipe(-20, 5)).toBe(true);
    expect(isSwipe(8, 0)).toBe(false);
    expect(isSwipe(20, 18)).toBe(false);
    expect(isSwipe(3, 40)).toBe(false);
  });
});

describe("actionOnRelease", () => {
  it("runs the direction's action beyond a third of the width", () => {
    expect(actionOnRelease(-140, 390, DEFAULT_SWIPES)).toBe("archive");
    expect(actionOnRelease(140, 390, DEFAULT_SWIPES)).toBe("read");
    expect(actionOnRelease(-100, 390, DEFAULT_SWIPES)).toBe("none");
    expect(actionOnRelease(-140, 0, DEFAULT_SWIPES)).toBe("none");
  });

  it("follows the settings", () => {
    expect(actionOnRelease(-200, 390, { left: "delete", right: "flag" })).toBe("delete");
    expect(actionOnRelease(200, 390, { left: "delete", right: "none" })).toBe("none");
  });
});

describe("offsetFor", () => {
  it("does not move towards a direction without an action", () => {
    expect(offsetFor(-50, DEFAULT_SWIPES)).toBe(-50);
    expect(offsetFor(50, { left: "archive", right: "none" })).toBe(0);
    expect(directionOf(-1)).toBe("left");
    expect(directionOf(1)).toBe("right");
  });
});

describe("readSwipeSettings", () => {
  it("reads what the device stored, falling back per direction", () => {
    expect(readSwipeSettings('{"left":"delete","right":"flag"}')).toEqual({
      left: "delete",
      right: "flag",
    });
    expect(readSwipeSettings('{"left":"explode"}')).toEqual(DEFAULT_SWIPES);
    expect(readSwipeSettings("kaputt")).toEqual(DEFAULT_SWIPES);
    expect(readSwipeSettings(null)).toEqual(DEFAULT_SWIPES);
  });
});
