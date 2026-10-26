// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshAtStalwart } from "./stalwart";

const answer = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("refreshing at Stalwart", () => {
  it("hands out the new tokens", async () => {
    vi.stubGlobal("fetch", answer(200, { access_token: "a2", expires_in: 3600 }));
    const result = await refreshAtStalwart("http://stalwart", "r1");
    expect(result.status === "ok" && result.tokens).toMatchObject({
      accessToken: "a2",
      refreshToken: "r1",
    });
  });

  it("calls a refused token rejected", async () => {
    vi.stubGlobal("fetch", answer(400, { error: "invalid_grant" }));
    expect(await refreshAtStalwart("http://stalwart", "r1")).toEqual({ status: "rejected" });
  });

  it("does not take a ban, a limit or a server error for a refused token", async () => {
    for (const status of [403, 429, 500, 503]) {
      vi.stubGlobal("fetch", answer(status));
      expect(await refreshAtStalwart("http://stalwart", "r1")).toEqual({ status: "unavailable" });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(await refreshAtStalwart("http://stalwart", "r1")).toEqual({ status: "unavailable" });
  });
});
