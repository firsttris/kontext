import { describe, expect, it } from "vitest";
import { createHandedOut } from "./handed-out";

describe("desk phone passwords", () => {
  it("go out once per phone and password, and that is remembered", async () => {
    let saved: string[] = [];
    const store = {
      load: async () => saved,
      save: async (keys: string[]) => {
        saved = keys;
      },
    };
    const firstTime = createHandedOut(store);
    expect(await firstTime("000413a1b2c3", "geheim")).toBe(true);
    expect(await firstTime("000413a1b2c3", "geheim")).toBe(false);
    // Another phone, or the same one added again with a new password.
    expect(await firstTime("000413ffffff", "geheim")).toBe(true);
    expect(await firstTime("000413a1b2c3", "neu")).toBe(true);
    // After a restart of the box.
    expect(await createHandedOut(store)("000413a1b2c3", "geheim")).toBe(false);
    expect(saved.join()).not.toContain("geheim");
  });
});
