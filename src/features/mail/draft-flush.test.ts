import { describe, expect, it } from "vitest";
import { flushDrafts, registerDraftFlush } from "./draft-flush";

describe("flushDrafts", () => {
  it("runs every registered composer's save, even when one fails", async () => {
    const saved: string[] = [];
    const first = registerDraftFlush(async () => {
      saved.push("first");
    });
    const failing = registerDraftFlush(async () => {
      throw new Error("offline");
    });
    const second = registerDraftFlush(async () => {
      saved.push("second");
    });
    await flushDrafts();
    expect(saved).toEqual(["first", "second"]);

    first();
    failing();
    await flushDrafts();
    expect(saved).toEqual(["first", "second", "second"]);
    second();
  });
});
