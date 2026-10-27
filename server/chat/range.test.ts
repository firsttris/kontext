// @vitest-environment node
import { describe, expect, it } from "vitest";
import { byteRange } from "./range";

describe("byteRange", () => {
  it("reads a range from, to and both", () => {
    expect(byteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(byteRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(byteRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
  });

  it("stops at the end of the file", () => {
    expect(byteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("refuses what lies past the end", () => {
    expect(byteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });

  it("sends the whole file for no, several or odd ranges", () => {
    expect(byteRange(undefined, 1000)).toBeNull();
    expect(byteRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(byteRange("items=0-1", 1000)).toBeNull();
    expect(byteRange("bytes=-", 1000)).toBeNull();
    expect(byteRange("bytes=500-100", 1000)).toBeNull();
  });
});
