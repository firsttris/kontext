import { describe, expect, it } from "vitest";
import { storageLevel } from "./storage";

describe("storageLevel", () => {
  it("gives the share and turns yellow at 80 %, red at 95 %", () => {
    expect(storageLevel(1, 4)).toEqual({ percent: 25, tone: "normal" });
    expect(storageLevel(80, 100)).toEqual({ percent: 80, tone: "warn" });
    expect(storageLevel(95, 100)).toEqual({ percent: 95, tone: "full" });
  });

  it("stays within 0–100 and has nothing without a limit", () => {
    expect(storageLevel(150, 100)?.percent).toBe(100);
    expect(storageLevel(5, null)).toBeUndefined();
    expect(storageLevel(5, 0)).toBeUndefined();
  });
});
