import { describe, expect, it, vi } from "vitest";
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

  it("does not wait forever for a save that never answers, so the sign-out still happens", async () => {
    vi.useFakeTimers();
    try {
      const hanging = registerDraftFlush(() => new Promise<void>(() => undefined));
      let done = false;
      const flushed = flushDrafts().then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(done).toBe(true);
      await flushed;
      hanging();
    } finally {
      vi.useRealTimers();
    }
  });
});
