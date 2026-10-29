import { afterEach, describe, expect, it, vi } from "vitest";
import { fillDemo } from "./demo-data";

const target = { app: "http://127.0.0.1:18090", origin: "http://localhost:5173", stalwart: "-" };

afterEach(() => vi.unstubAllGlobals());

describe("fillDemo", () => {
  it("signs everyone in like the form and leaves a filled database alone", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        if (url.endsWith("/api/auth/sign-in/stalwart")) {
          return new Response("{}", {
            headers: { "set-cookie": "better-auth.session_token=abc; Path=/; HttpOnly" },
          });
        }
        return Response.json({
          channels: [{ id: "c1", kind: "channel", name: "baustelle-hoffmann" }],
        });
      }),
    );
    expect(await fillDemo(target, { once: true })).toBeNull();
    const signIns = calls.filter((call) => call.url.endsWith("/sign-in/stalwart"));
    expect(signIns).toHaveLength(4);
    expect(signIns[0]!.headers.origin).toBe("http://localhost:5173");
    const list = calls.at(-1)!;
    expect(list.url).toBe("http://127.0.0.1:18090/api/chat/channels");
    expect(list.headers.cookie).toBe("better-auth.session_token=abc");
    expect(list.headers.origin).toBe("http://localhost:5173");
  });

  it("says who could not sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );
    await expect(fillDemo(target)).rejects.toThrow("Anmeldung jonas: 401");
  });
});
