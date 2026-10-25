// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createServerJmap } from "./jmap-server";

const session = (accountId: string, isReadOnly = false) => ({
  apiUrl: "https://mail.firma.de/jmap/",
  uploadUrl: "https://mail.firma.de/jmap/upload/{accountId}/",
  accounts: {
    [accountId]: { isReadOnly, accountCapabilities: { "urn:ietf:params:jmap:mail": {} } },
  },
});

describe("createServerJmap", () => {
  it("imports a message into the inbox with the sign-in of someone who may write there", async () => {
    const requests: { url: string; token: string; body: unknown }[] = [];
    const sessions: Record<string, unknown> = {
      "token-anna": session("anna"),
      "token-jonas": session("info"),
    };
    const jmap = createServerJmap({
      env: { STALWART_URL: "http://stalwart:8080" },
      grants: { accessToken: async (id) => `token-${id}` },
      sessions: async () => ["anna", "jonas"],
      fetch: (async (url: string, init: RequestInit) => {
        const token = String((init.headers as Record<string, string>).authorization).slice(7);
        const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
        requests.push({ url, token, body });
        if (url.endsWith("/jmap/session")) return Response.json(sessions[token]);
        if (url.includes("/upload/")) return Response.json({ blobId: "blob-1" });
        const method = (body as { methodCalls: [string][] }).methodCalls[0]?.[0];
        if (method === "Mailbox/query") {
          return Response.json({ methodResponses: [["Mailbox/query", { ids: ["inbox-1"] }, "m"]] });
        }
        return Response.json({
          methodResponses: [["Email/import", { created: { mail: { id: "e1" } } }, "i"]],
        });
      }) as typeof fetch,
    });

    expect(
      await jmap.importMessage("info", new TextEncoder().encode("Subject: x\r\n\r\nhi")),
    ).toEqual({
      ok: true,
      emailId: "e1",
    });
    const upload = requests.find((request) => request.url.includes("/upload/"))!;
    expect(upload).toMatchObject({
      url: "http://stalwart:8080/jmap/upload/info/",
      token: "token-jonas",
    });
    expect(requests.at(-1)!.body).toMatchObject({
      methodCalls: [
        [
          "Email/import",
          {
            accountId: "info",
            emails: { mail: { blobId: "blob-1", mailboxIds: { "inbox-1": true } } },
          },
          "i",
        ],
      ],
    });
  });

  it("says so when nobody may write there", async () => {
    const jmap = createServerJmap({
      env: { STALWART_URL: "http://stalwart:8080" },
      grants: { accessToken: async () => "t" },
      sessions: async () => ["anna"],
      fetch: (async () => Response.json(session("info", true))) as unknown as typeof fetch,
    });
    expect((await jmap.importMessage("info", new Uint8Array())).ok).toBe(false);
  });
});
