// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codeFromRedirect,
  loginAtStalwart,
  passkeyOptionsAtStalwart,
  REDIRECT_URI,
  refreshAtStalwart,
  revokeAtStalwart,
} from "./stalwart";

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

describe("revoking at Stalwart", () => {
  it("sends the token as Kontext's client and says whether it worked", async () => {
    const fetch = answer(200);
    vi.stubGlobal("fetch", fetch);
    expect(await revokeAtStalwart("http://stalwart", "r1")).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://stalwart/auth/revoke");
    expect(String(init.body)).toBe("token=r1&client_id=kontext");
  });

  it("does not throw while Stalwart is away", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(await revokeAtStalwart("http://stalwart", "r1")).toBe(false);
  });
});

describe("signing in at Stalwart", () => {
  const credentials = { email: "jonas@weber.test", password: "falsch" };

  /** Stalwart as it answers a right password: the code in the redirect, then the tokens. */
  const stalwart = (redirect: (state: string) => string) =>
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/api/auth")) {
        const body = JSON.parse(String(init.body));
        const state = new URLSearchParams(body.query).get("state") ?? "";
        return new Response(JSON.stringify({ type: "authenticated", location: redirect(state) }));
      }
      return new Response(
        JSON.stringify({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }),
      );
    });

  it("sends the authorization request with consent and swaps the code from the redirect", async () => {
    const fetch = stalwart((state) => `${REDIRECT_URI}?code=c1&state=${state}&iss=x`);
    vi.stubGlobal("fetch", fetch);
    const result = await loginAtStalwart("http://stalwart", credentials);
    expect(result.status === "ok" && result.tokens).toMatchObject({
      accessToken: "a1",
      refreshToken: "r1",
    });
    const login = JSON.parse(String(fetch.mock.calls[0]![1].body));
    expect(login).toMatchObject({
      type: "authCode",
      accountName: "jonas@weber.test",
      consent: true,
    });
    expect(Object.fromEntries(new URLSearchParams(login.query))).toMatchObject({
      response_type: "code",
      client_id: "kontext",
      redirect_uri: REDIRECT_URI,
      scope: "urn:stalwart:oauth:scope:full",
      code_challenge_method: "S256",
    });
    const token = new URLSearchParams(String(fetch.mock.calls[1]![1].body));
    expect(token.get("code")).toBe("c1");
    expect(token.get("code_verifier")).toBeTruthy();
  });

  it("takes no code from a redirect for another request", async () => {
    vi.stubGlobal(
      "fetch",
      stalwart(() => `${REDIRECT_URI}?code=c1&state=fremd`),
    );
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
      status: "unavailable",
    });
  });

  it("asks for the code when the account has two-factor sign-in", async () => {
    vi.stubGlobal("fetch", answer(200, { type: "mfaRequired" }));
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({ status: "mfa" });
  });

  it("signs in with a passkey's assertion, for the same authorization request", async () => {
    const fetch = stalwart((state) => `${REDIRECT_URI}?code=c1&state=${state}`);
    vi.stubGlobal("fetch", fetch);
    const passkey = {
      rawId: "k1",
      response: { clientDataJSON: "c", authenticatorData: "a", signature: "s", userHandle: "u" },
    };
    const result = await loginAtStalwart("http://stalwart", { passkey });
    expect(result.status).toBe("ok");
    const login = JSON.parse(String(fetch.mock.calls[0]![1].body));
    expect(login).toMatchObject({ type: "authCodePasskey", credential: passkey, consent: true });
    expect(login).not.toHaveProperty("accountName");
    expect(new URLSearchParams(login.query).get("client_id")).toBe("kontext");
  });

  it("calls a passkey Stalwart does not know failed", async () => {
    vi.stubGlobal("fetch", answer(200, { type: "passkeyUnknown" }));
    const passkey = {
      rawId: "k1",
      response: { clientDataJSON: "c", authenticatorData: "a", signature: "s" },
    };
    expect(await loginAtStalwart("http://stalwart", { passkey })).toEqual({ status: "failed" });
  });

  it("calls an expired password failed", async () => {
    vi.stubGlobal("fetch", answer(200, { type: "expired" }));
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({ status: "failed" });
  });

  it("gives no verdict on the password when Stalwart refuses the client", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      answer(200, { type: "invalid", error: "invalid_client", description: "Unknown client id" }),
    );
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
      status: "unavailable",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unknown client id"));
    warn.mockRestore();
  });

  it("logs why when Stalwart answers with an error redirect", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      answer(200, {
        type: "redirect",
        location: `${REDIRECT_URI}?error=unauthorized_client&error_description=Not+allowed`,
      }),
    );
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
      status: "unavailable",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unauthorized_client"));
    warn.mockRestore();
  });

  it("names the missing scope when the client does not allow full", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      answer(200, {
        type: "redirect",
        location: `${REDIRECT_URI}?error=invalid_scope&error_description=The+requested+scope+is+not+allowed+for+this+client.`,
      }),
    );
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
      status: "unavailable",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('den Scope "full"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("bun server/setup-stalwart.ts"));
    warn.mockRestore();
  });

  it("calls a wrong password failed", async () => {
    vi.stubGlobal("fetch", answer(200, { type: "failure" }));
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({ status: "failed" });
  });

  it("gives no verdict on the password when Stalwart does not answer as it should", async () => {
    for (const status of [403, 429, 500]) {
      vi.stubGlobal("fetch", answer(status));
      expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
        status: "unavailable",
      });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(await loginAtStalwart("http://stalwart", credentials)).toEqual({
      status: "unavailable",
    });
  });
});

describe("passkey options from Stalwart", () => {
  it("are the challenge, relying party and timeout it hands out", async () => {
    const fetch = answer(200, {
      type: "passkeyOptions",
      challenge: "ch",
      rpId: "kontext.firma.de",
      timeout: 300000,
    });
    vi.stubGlobal("fetch", fetch);
    expect(await passkeyOptionsAtStalwart("http://stalwart")).toEqual({
      challenge: "ch",
      rpId: "kontext.firma.de",
      timeout: 300000,
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ type: "passkeyOptions" });
  });

  it("are none when Stalwart has no public URL for them (before 1.1.0: no such request)", async () => {
    vi.stubGlobal("fetch", answer(200, { type: "failure" }));
    expect(await passkeyOptionsAtStalwart("http://stalwart")).toBeNull();
    vi.stubGlobal("fetch", answer(400, { type: "about:blank" }));
    expect(await passkeyOptionsAtStalwart("http://stalwart")).toBeNull();
  });
});

describe("codeFromRedirect", () => {
  it("takes the code only from Kontext's redirect URI with the request's state", () => {
    expect(codeFromRedirect(`${REDIRECT_URI}?code=c1&state=s1`, "s1")).toBe("c1");
    expect(codeFromRedirect(`${REDIRECT_URI}?code=c1&state=s2`, "s1")).toBeNull();
    expect(codeFromRedirect("https://evil.example/oauth?code=c1&state=s1", "s1")).toBeNull();
    expect(codeFromRedirect("kein link", "s1")).toBeNull();
  });
});
