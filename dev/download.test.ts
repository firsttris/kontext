import { describe, expect, it } from "vitest";
import { describeTransfer } from "./download";

describe("describeTransfer", () => {
  it("shows received, total, percent and speed", () => {
    expect(describeTransfer(12e6, 42e6, 1000)).toBe("12 / 42 MB (28 %), 12 MB/s");
  });

  it("leaves out total and percent when the size is unknown", () => {
    expect(describeTransfer(5e6, 0, 2000)).toBe("5 MB, 3 MB/s");
  });

  it("does not divide by zero right at the start", () => {
    expect(describeTransfer(0, 42e6, 0)).toBe("0 / 42 MB (0 %), 0 MB/s");
  });
});
