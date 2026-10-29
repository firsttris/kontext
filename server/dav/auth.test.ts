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

  it("lets one old password, tried again and again behind an office's address, block nobody", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      new Headers(init?.headers).get("authorization") === basic("anna@firma.test", "neu")
        ? Response.json({ apiUrl: "/jmap/", primaryAccounts: {}, accounts: {} })
        : new Response("", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch);
    const auth = createDavAuth(
      { STALWART_URL: "http://stalwart" },
      Date.now,
      createFailureLimit(3, 60_000),
    );
    for (let i = 0; i < 10; i++) await auth(basic("jonas@firma.test", "alt"), "198.51.100.1");
    await auth(basic("anna@firma.test", "neu"), "198.51.100.1");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://stalwart/jmap/session",
      expect.objectContaining({ headers: { authorization: basic("anna@firma.test", "neu") } }),
    );
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

  it("takes an app password through its own grant, and stops at once when it is revoked", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      new Headers(init?.headers).get("authorization") === "Bearer grant-token"
        ? Response.json({
            apiUrl: "http://stalwart/jmap/",
            primaryAccounts: { "urn:ietf:params:jmap:mail": "a1" },
            accounts: {},
          })
        : new Response("", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch);
    let revoked = false;
    const auth = createDavAuth(
      { STALWART_URL: "http://stalwart" },
      Date.now,
      createFailureLimit(5, 60_000),
      {
        resolve: async (email, password) =>
          !revoked && email === "jonas@firma.test" && password === "abcd-efgh-jkmn-pqrs-tuvw"
            ? { id: "p1", email, sessionId: "s1" }
            : null,
        tokenOf: async (sessionId) => (sessionId === "s1" ? "grant-token" : null),
      },
    );
    const header = basic("Jonas@firma.test", "abcd-efgh-jkmn-pqrs-tuvw");
    expect(await auth(header)).toEqual({ me: "a1", accounts: [] });
    // Never sent to Stalwart as a password.
    expect(fetch).not.toHaveBeenCalledWith(
      "http://stalwart/jmap/session",
      expect.objectContaining({ headers: { authorization: header } }),
    );
    revoked = true;
    expect(await auth(header)).toBeNull();
    // A wrong one is Stalwart's to refuse.
    expect(await auth(basic("jonas@firma.test", "zzzz-zzzz-zzzz-zzzz-zzzz"))).toBeNull();
  });
});
