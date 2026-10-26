import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn } from "./auth";

afterEach(() => vi.unstubAllGlobals());

describe("signIn", () => {
  it("tells a wrong password, too many tries and a server away apart", async () => {
    for (const [status, result] of [
      [401, "failed"],
      [429, "limited"],
      [503, "offline"],
    ] as const) {
      vi.stubGlobal("fetch", async () => new Response("{}", { status }));
      expect(await signIn("jonas@weber.test", "x"), String(status)).toBe(result);
    }
  });
});
