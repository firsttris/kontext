import { describe, expect, it } from "vitest";
import { everyonePatches, FREE_BUSY, newcomerPatches } from "./availability";

describe("free and busy times in the company", () => {
  it("shows a newcomer's calendars to everyone and adds them where all colleagues see", () => {
    const patches = newcomerPatches("n", {
      // Anna kept the default: Max sees her calendar.
      a: [{ id: "cal", shareWith: { m: { mayReadFreeBusy: true } } }],
      // Max took it back from Anna; the newcomer does not get it either.
      m: [{ id: "cal", shareWith: {} }],
      n: [{ id: "cal", shareWith: null }],
    });
    expect(patches).toEqual({
      a: { cal: { "shareWith/n": FREE_BUSY } },
      n: { cal: { "shareWith/a": FREE_BUSY, "shareWith/m": FREE_BUSY } },
    });
  });

  it("keeps more access and does not patch what already fits", () => {
    const patches = newcomerPatches("n", {
      a: [{ id: "cal", shareWith: { n: { mayReadFreeBusy: true, mayReadItems: true } } }],
      n: [{ id: "cal", shareWith: { a: { mayReadItems: true } } }],
    });
    expect(patches).toEqual({});
  });

  it("switches it on for everyone", () => {
    const patches = everyonePatches({
      a: [
        { id: "cal", shareWith: null },
        { id: "home", shareWith: { m: { mayReadFreeBusy: true } } },
      ],
      m: [{ id: "cal", shareWith: { a: { mayReadItems: true } } }],
    });
    expect(patches).toEqual({ a: { cal: { "shareWith/m": FREE_BUSY } } });
  });
});
