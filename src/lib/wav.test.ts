import { describe, expect, it } from "vitest";
import { floatToInt16 } from "./wav";

describe("floatToInt16", () => {
  it("scales to 16 bit and clips what is too loud", () => {
    expect([...floatToInt16(new Float32Array([0, 1, -1, 0.5, 2, -3]))]).toEqual([
      0, 32767, -32768, 16384, 32767, -32768,
    ]);
  });
});
