import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn, signInWithPasskey } from "./auth";

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

describe("signInWithPasskey", () => {
  const options = { challenge: "AQID", rpId: "localhost", timeout: 1000 };
  const credential = {
    rawId: new Uint8Array([1]).buffer,
    response: {
      clientDataJSON: new Uint8Array([2]).buffer,
      authenticatorData: new Uint8Array([3]).buffer,
      signature: new Uint8Array([4]).buffer,
      userHandle: new Uint8Array([0, 0, 0, 7]).buffer,
    },
  };
  const withCredentials = (get: () => Promise<unknown>) =>
    vi.stubGlobal("navigator", { ...navigator, credentials: { get } });

  it("sends the browser's answer to Stalwart's challenge to the server", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/passkey-options")
        ? new Response(JSON.stringify(options))
        : new Response(JSON.stringify({ status: "ok" })),
    );
    vi.stubGlobal("fetch", fetch);
    withCredentials(async () => credential);
    expect(await signInWithPasskey()).toBe("ok");
    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe("/api/auth/sign-in/stalwart");
    expect(JSON.parse(String(init?.body))).toEqual({
      passkey: {
        rawId: "AQ",
        response: {
          clientDataJSON: "Ag",
          authenticatorData: "Aw",
          signature: "BA",
          userHandle: "AAAABw",
        },
      },
    });
  });

  it("calls a closed dialog cancelled, and asks nothing of the server then", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(options)));
    vi.stubGlobal("fetch", fetch);
    withCredentials(async () => {
      throw new DOMException("closed", "NotAllowedError");
    });
    expect(await signInWithPasskey()).toBe("cancelled");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("says so when the server offers no challenge (Stalwart before 1.1.0)", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    expect(await signInWithPasskey()).toBe("no-passkeys");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    expect(await signInWithPasskey()).toBe("offline");
  });
});
