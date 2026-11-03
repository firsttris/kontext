import { describe, expect, it } from "vitest";
import { fitScale } from "./use-fitted-frame";

describe("fitScale", () => {
  it("leaves a mail as it is when it fits", () => {
    expect(fitScale(360, 360)).toBe(1);
    expect(fitScale(200, 360)).toBe(1);
  });
  it("shrinks a wider mail to the frame's width", () => {
    expect(fitScale(600, 300)).toBe(0.5);
  });
  it("leaves it unscaled while the frame has no width yet", () => {
    expect(fitScale(600, 0)).toBe(1);
  });
});
