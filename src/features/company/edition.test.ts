import { afterEach, describe, expect, it, vi } from "vitest";
import { getEdition } from "./edition";

afterEach(() => vi.unstubAllGlobals());

describe("getEdition", () => {
  it("reads the server's answer, unknown when there is none", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ edition: "enterprise" }));
    expect(await getEdition()).toBe("enterprise");
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect(await getEdition()).toBe("unknown");
  });
});
