import { describe, expect, it } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits into pieces", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
});
