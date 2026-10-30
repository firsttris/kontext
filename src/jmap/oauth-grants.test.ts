import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { endOAuthGrant, listOAuthGrants, type OAuthGrant, otherPrograms } from "./oauth-grants";

const grant = (id: string, clientId: string, lastUsedAt: string): OAuthGrant => ({
  id,
  clientId,
  clientName: clientId,
  remoteIp: null,
  createdAt: "2026-10-01T08:00:00Z",
  lastUsedAt,
});

describe("otherPrograms", () => {
  it("leaves out Kontext's own sign-ins, newest use first", () => {
    const grants = [
      grant("a", "thunderbird", "2026-10-02T08:00:00Z"),
      grant("b", "kontext", "2026-10-30T08:00:00Z"),
      grant("c", "apple-mail", "2026-10-03T08:00:00Z"),
    ];
    expect(otherPrograms(grants).map((g) => g.id)).toEqual(["c", "a"]);
  });
});

describe("the grants at Stalwart", () => {
  it("are read and ended as the person's own registry objects", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const client = {
      call: async (method: string, args: Record<string, unknown>) => {
        calls.push([method, args]);
        return method.endsWith("/get")
          ? { list: [grant("a", "thunderbird", "2026-10-02T08:00:00Z")] }
          : { destroyed: ["a"] };
      },
    } as unknown as JmapClient;
    expect((await listOAuthGrants(client)).map((g) => g.id)).toEqual(["a"]);
    await endOAuthGrant(client, "a");
    expect(calls.map(([method]) => method)).toEqual(["x:OAuthGrant/get", "x:OAuthGrant/set"]);
    expect(calls[1]![1]).toEqual({ destroy: ["a"] });
  });

  it("says when Stalwart refuses", async () => {
    const client = {
      call: async () => ({ notDestroyed: { a: { type: "forbidden" } } }),
    } as unknown as JmapClient;
    await expect(endOAuthGrant(client, "a")).rejects.toThrow("forbidden");
  });
});
