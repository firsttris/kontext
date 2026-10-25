// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accountRights, createFoldersOf, type Folder } from "./account-rights";

/**
 * Stalwart 0.16.27 takes at most 16 method calls per request (`maxMethodCalls`, default 16,
 * crates/registry/src/schema/structs_impl.rs) and answers a longer one with HTTP 400
 * `urn:ietf:params:jmap:error:limit` (crates/jmap-proto/src/request/parser.rs) – checked against
 * a real 0.16.27.
 */
const stalwart = (folders: Record<string, Folder[] | "forbidden">): typeof fetch =>
  (async (_url: string, init?: RequestInit) => {
    const { methodCalls } = JSON.parse(String(init?.body)) as {
      methodCalls: [string, { accountId: string }, string][];
    };
    if (methodCalls.length > 16) {
      return Response.json(
        { type: "urn:ietf:params:jmap:error:limit", status: 400, limit: "maxCallsInRequest" },
        { status: 400 },
      );
    }
    return Response.json({
      methodResponses: methodCalls.map(([name, { accountId }, id]) => {
        const list = folders[accountId];
        return list === "forbidden" || !list
          ? ["error", { type: "forbidden" }, id]
          : [name, { accountId, list }, id];
      }),
    });
  }) as unknown as typeof fetch;

const account = (name: string, isPersonal = false) => ({
  name,
  isPersonal,
  accountCapabilities: {
    "urn:ietf:params:jmap:mail": {},
    "urn:ietf:params:jmap:calendars": { mayCreateCalendar: isPersonal },
  },
});

describe("account rights with many colleagues sharing a calendar", () => {
  it("keeps info@ (Nur lesen) and a handed-over mailbox when 16 colleagues share a calendar", async () => {
    const colleagues = Array.from({ length: 16 }, (_, i) => `k${i}`);
    const accounts = {
      max: account("max", true),
      info: account("info"),
      sandra: account("sandra"),
      ...Object.fromEntries(colleagues.map((id) => [id, account(id)])),
    };
    const folders = {
      info: [{ role: "inbox", myRights: { mayAddItems: false } }],
      sandra: [{ role: "inbox", myRights: { mayAddItems: true } }],
      ...Object.fromEntries(colleagues.map((id) => [id, "forbidden" as const])),
    };
    const rights = await accountRights(
      accounts,
      createFoldersOf("http://stalwart.test/jmap/", "Basic x", stalwart(folders)),
    );
    expect(rights.map(({ id, isReadOnly }) => ({ id, isReadOnly }))).toEqual([
      { id: "max", isReadOnly: false },
      { id: "info", isReadOnly: true },
      { id: "sandra", isReadOnly: false },
    ]);
  });

  it("a failed request costs only its own accounts", async () => {
    let calls = 0;
    const flaky = (async (url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return new Response("", { status: 500 });
      return stalwart({ b: [{ role: "inbox", myRights: { mayAddItems: true } }] })(url, init);
    }) as unknown as typeof fetch;
    const foldersOf = createFoldersOf("http://stalwart.test/jmap/", "Basic x", flaky, 1);
    expect(await foldersOf(["a", "b"])).toEqual({
      a: null,
      b: [{ role: "inbox", myRights: { mayAddItems: true } }],
    });
  });
});
