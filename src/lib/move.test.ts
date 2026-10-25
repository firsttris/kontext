import { describe, expect, it } from "vitest";
import { moved } from "./move";

describe("moved", () => {
  it("swaps with the neighbour and stays at the ends", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const items = ["a", "b"];
    expect(moved(items, 0, -1)).toBe(items);
    expect(moved(items, 1, 1)).toBe(items);
  });
});
