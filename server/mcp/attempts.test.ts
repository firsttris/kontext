// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAttempts } from "./attempts";

describe("password tries", () => {
  it("allow so many a minute per person, then again after the minute", () => {
    let now = 0;
    const mayTry = createAttempts(3, () => now);
    expect([mayTry("u1"), mayTry("u1"), mayTry("u1"), mayTry("u1")]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    // Someone else has their own count.
    expect(mayTry("u2")).toBe(true);
    now = 59_999;
    expect(mayTry("u1")).toBe(false);
    now = 60_001;
    expect(mayTry("u1")).toBe(true);
  });
});
