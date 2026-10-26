// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createFailureLimit } from "../failures";
import { createPhoneRoutes, type PhoneRouteDeps } from "./routes";

describe("pairing a telephone box", () => {
  it("stops an address that tries too many codes", async () => {
    const pair = vi.fn(async (code: string) => (code === "RIGHT-CODE" ? { token: "t" } : null));
    const app = createPhoneRoutes({
      store: { pair },
      boxFiles: new Hono(),
      upgradeWebSocket: () => async () => new Response(null),
      pairFailures: createFailureLimit(3, 60_000),
    } as unknown as PhoneRouteDeps);
    const tryCode = (code: string, from: string) =>
      app.request("/box/pair", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": from },
        body: JSON.stringify({ code }),
      });
    for (const code of ["AAAA", "BBBB", "CCCC"]) {
      expect((await tryCode(code, "203.0.113.5")).status).toBe(403);
    }
    expect((await tryCode("RIGHT-CODE", "203.0.113.5")).status).toBe(429);
    expect(pair).toHaveBeenCalledTimes(3);
    // Another address still pairs.
    expect((await tryCode("RIGHT-CODE", "198.51.100.7")).status).toBe(200);
  });
});
