// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFailureLimit } from "../failures";
import { createDavAuth } from "./auth";

const basic = (login: string, password: string) =>
  `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;

afterEach(() => vi.unstubAllGlobals());

describe("DAV sign-in", () => {
  it("stops asking Stalwart once a login name failed too often", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const auth = createDavAuth(
      { STALWART_URL: "http://stalwart" },
      Date.now,
      createFailureLimit(3, 60_000),
    );
    for (const password of ["a", "b", "c"]) {
      expect(
        await auth(basic("jonas@firma.test", password), `10.0.0.${password.length}`),
      ).toBeNull();
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await auth(basic("Jonas@firma.test", "d"), "10.0.0.9")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops asking Stalwart for an address that tried too many names", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const auth = createDavAuth(
      { STALWART_URL: "http://stalwart" },
      Date.now,
      createFailureLimit(2, 60_000),
    );
    await auth(basic("a@firma.test", "x"), "203.0.113.5");
    await auth(basic("b@firma.test", "x"), "203.0.113.5");
    await auth(basic("c@firma.test", "x"), "203.0.113.5");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not count it against anyone when Stalwart does not answer", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const auth = createDavAuth(
      { STALWART_URL: "http://stalwart" },
      Date.now,
      createFailureLimit(1, 60_000),
    );
    await auth(basic("a@firma.test", "x"), "203.0.113.5");
    await auth(basic("a@firma.test", "x"), "203.0.113.5");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
