import { describe, expect, it } from "vitest";
import { INLINE_LIMIT } from "./importer";
import { batchesOf } from "./sync-runner";

const head = (uid: number, size = 1000) => ({
  uid,
  messageId: `${uid}@x`,
  flags: new Set<string>(),
  internalDate: null,
  size,
});

describe("batchesOf", () => {
  it("puts at most 25 mails into a request", () => {
    const sizes = batchesOf(Array.from({ length: 60 }, (_, i) => head(i))).map((b) => b.length);
    expect(sizes).toEqual([25, 25, 10]);
  });

  it("starts a new batch before 6 MB and keeps a large mail alone", () => {
    const batches = batchesOf([head(1, 4_000_000), head(2, 3_000_000), head(3, INLINE_LIMIT + 1)]);
    expect(batches.map((b) => b.map((h) => h.uid))).toEqual([[1], [2], [3]]);
  });
});
