// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createGrants } from "../auth";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import type { Connections, McpCaller } from "./connections";
import { createMcpEndpoint } from "./routes";

vi.mock("../db", async () => ({
  schema: { ...(await import("../db/schema")), ...(await import("../db/oauth-schema")) },
}));

const expiredGrantDb = () =>
  ({
    select: () => ({
      from: () => ({
        where: async () => [
          {
            sessionId: "s1",
            accessToken: "a",
            refreshToken: "r",
            accessExpiresAt: new Date(Date.now() - 1000),
          },
        ],
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  }) as unknown as Db;

const sealer = { seal: async (v: string) => v, open: async (v: string) => v } as Sealer;

const oauthCaller: McpCaller = {
  connectionId: "o1",
  userId: "u1",
  sessionId: "s1",
  email: "jonas@weber-haustechnik.test",
  scopes: ["read"],
  clientId: "claude",
};

describe("/mcp while Stalwart is briefly unavailable", () => {
  it("keeps the agent's OAuth connection and consent", async () => {
    const remove = vi.fn(async () => ({ clientId: "claude" }));
    const revokeClient = vi.fn(async () => undefined);
    const grants = createGrants(expiredGrantDb(), sealer, "http://stalwart", async () => ({
      status: "unavailable" as const,
    }));
    const endpoint = createMcpEndpoint({
      connections: { remove } as unknown as Connections,
      grants,
      stalwartUrl: "http://stalwart",
      version: "0",
      userOf: async () => null,
      login: async () => ({ status: "failed" }),
      tasksFor: () => async () => ({ status: 200, body: {} }),
      mayTryPassword: () => true,
      oauthCaller: async (_request, token) =>
        token ? oauthCaller : new Response(null, { status: 401 }),
      revokeClient,
    });
    await endpoint(
      new Request("http://kontext.test/mcp", {
        method: "POST",
        headers: { authorization: "Bearer eyJ.good", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(revokeClient).not.toHaveBeenCalled();
  });
});
