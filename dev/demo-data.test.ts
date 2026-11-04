import { afterEach, describe, expect, it, vi } from "vitest";
import { fillDemo, seedIsIn } from "./demo-data";

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

describe("seedIsIn", () => {
  const stalwart = "http://127.0.0.1:18080";
  /** A Stalwart whose accounts hold the mails with these subjects. */
  const stalwartWith = (subjects: string[]) =>
    vi.fn(async (url: string) => {
      if (url.endsWith("/jmap/session")) {
        const account = (name: string) => ({
          name,
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {},
        });
        return Response.json({
          username: "jonas@weber-haustechnik.test",
          apiUrl: `${stalwart}/jmap/`,
          downloadUrl: `${stalwart}/download`,
          uploadUrl: `${stalwart}/upload`,
          eventSourceUrl: `${stalwart}/events`,
          state: "s",
          primaryAccounts: {},
          accounts: {
            a: account("jonas@weber-haustechnik.test"),
            b: account("info@weber-haustechnik.test"),
          },
        });
      }
      const list = subjects.map((subject, i) => ({ id: `m${i}`, threadId: `t${i}`, subject }));
      return Response.json({
        methodResponses: [
          ["Email/query", { ids: list.map((mail) => mail.id) }, "q"],
          ["Email/get", { list }, "g"],
        ],
      });
    });

  it("waits while Stalwart does not answer yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("connection refused");
      }),
    );
    expect(await seedIsIn(stalwart)).toBe(false);
  });

  it("waits until both mails the demo points to are in", async () => {
    vi.stubGlobal("fetch", stalwartWith(["Anfrage Wärmepumpe Neubau"]));
    expect(await seedIsIn(stalwart)).toBe(false);
    vi.stubGlobal(
      "fetch",
      stalwartWith(["Anfrage Wärmepumpe Neubau", "Re: Badsanierung Obergeschoss"]),
    );
    expect(await seedIsIn(stalwart)).toBe(true);
  });
});
