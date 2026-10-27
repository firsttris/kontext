import { describe, expect, it } from "vitest";
import { fitAboveKeyboard, hiddenBelow } from "./use-visible-height";

describe("hiddenBelow", () => {
  it("is nothing without a keyboard", () => {
    expect(hiddenBelow(844, { height: 844, offsetTop: 0 })).toBe(0);
  });

  it("is the keyboard's height when the page stays at its top (iOS)", () => {
    expect(hiddenBelow(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it("subtracts how far the visible part has moved down the page", () => {
    expect(hiddenBelow(844, { height: 508, offsetTop: 100 })).toBe(236);
  });

  it("is nothing when the page itself got shorter (Android, resizes-content)", () => {
    expect(hiddenBelow(508, { height: 508, offsetTop: 0 })).toBe(0);
  });

  it("never goes below zero", () => {
    expect(hiddenBelow(800, { height: 800.4, offsetTop: 0.3 })).toBe(0);
  });
});

describe("fitAboveKeyboard", () => {
  it("leaves the app as high as the screen without a keyboard", () => {
    expect(fitAboveKeyboard(844, { height: 844, offsetTop: 0, scale: 1 }, 0)).toEqual({
      appHeight: 844,
      keyboardHeight: 0,
    });
  });

  it("takes the visible height when the keyboard shrinks what one sees (iOS)", () => {
    expect(fitAboveKeyboard(844, { height: 508, offsetTop: 0, scale: 1 }, 0)).toEqual({
      appHeight: 508,
      keyboardHeight: 336,
    });
  });

  it("makes room for a keyboard that lies over the page (Android, VirtualKeyboard API)", () => {
    expect(fitAboveKeyboard(915, { height: 915, offsetTop: 0, scale: 1 }, 330.4)).toEqual({
      appHeight: 584.6,
      keyboardHeight: 330,
    });
  });

  it("leaves the page alone when zoomed in without a keyboard over it", () => {
    expect(fitAboveKeyboard(844, { height: 422, offsetTop: 200, scale: 2 }, 0)).toBeUndefined();
  });

  it("still makes room for a keyboard over the page when zoomed in", () => {
    expect(fitAboveKeyboard(915, { height: 300, offsetTop: 400, scale: 2 }, 330)).toEqual({
      appHeight: 585,
      keyboardHeight: 330,
    });
  });
});
