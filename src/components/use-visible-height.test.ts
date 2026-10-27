import { describe, expect, it } from "vitest";
import { hiddenBelow } from "./use-visible-height";

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
