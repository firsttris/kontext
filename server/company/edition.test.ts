// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createEditionCheck,
  EDITION_RETRY_MS,
  EDITION_TTL_MS,
  editionOf,
  readEdition,
} from "./edition";

const answering = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("editionOf", () => {
  it("reads Stalwart's edition, anything unexpected is unknown", () => {
    expect(editionOf({ edition: "enterprise", permissions: [] })).toBe("enterprise");
    expect(editionOf({ edition: "community" })).toBe("community");
    expect(editionOf({ edition: "oss" })).toBe("community");
    expect(editionOf({ edition: "platinum" })).toBe("unknown");
    expect(editionOf({})).toBe("unknown");
    expect(editionOf(null)).toBe("unknown");
  });
});

describe("createEditionCheck", () => {
  it("asks /api/account with the server's key and keeps the answer for a while", async () => {
    const fetch = answering({ edition: "enterprise" });
    let time = 0;
    const check = createEditionCheck({
      stalwartUrl: "http://stalwart:8080",
      key: "API_abc",
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => time,
    });
    expect(await check()).toBe("enterprise");
    expect(fetch).toHaveBeenCalledWith("http://stalwart:8080/api/account", {
      headers: { authorization: "Bearer API_abc" },
    });
    time = EDITION_TTL_MS - 1;
    await check();
    expect(fetch).toHaveBeenCalledTimes(1);
    time = EDITION_TTL_MS;
    await check();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("says unknown when Stalwart refuses or cannot be reached, and asks again sooner", async () => {
    let time = 0;
    const refused = answering({ error: "forbidden" }, 403);
    const check = createEditionCheck({
      stalwartUrl: "http://stalwart:8080",
      key: "admin:secret",
      fetch: refused as unknown as typeof globalThis.fetch,
      now: () => time,
    });
    expect(await check()).toBe("unknown");
    time = EDITION_RETRY_MS;
    await check();
    expect(refused).toHaveBeenCalledTimes(2);

    const away = createEditionCheck({
      stalwartUrl: "http://stalwart:8080",
      key: "API_abc",
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof globalThis.fetch,
    });
    expect(await away()).toBe("unknown");
  });
});

describe("readEdition", () => {
  it("answers only the signed-in, unknown without a check", async () => {
    const signedIn = async () => "anna@firma.de";
    expect(
      await readEdition({ currentEmail: signedIn, edition: async () => "community" })(
        new Request("http://kontext.test/"),
      ),
    ).toEqual({ edition: "community" });
    expect(
      await readEdition({ currentEmail: signedIn })(new Request("http://kontext.test/")),
    ).toEqual({ edition: "unknown" });
    expect(
      await readEdition({ currentEmail: async () => null })(new Request("http://kontext.test/")),
    ).toBeNull();
  });
});
