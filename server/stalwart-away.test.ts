// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "./auth";
import { createGrants } from "./auth";
import type { Sealer } from "./crypto";
import type { Db } from "./db";
import { readEnv } from "./env";

vi.mock("./db", async () => ({
  schema: { ...(await import("./db/schema")), ...(await import("./db/oauth-schema")) },
}));

vi.mock("hono/bun", () => ({
  serveStatic: () => async () => undefined,
  createBunWebSocket: () => ({ websocket: {}, upgradeWebSocket: () => async () => undefined }),
}));
vi.stubGlobal("Bun", { file: () => null });

const { createJmapProxy } = await import("./app");

/** One stored grant whose access token has run out. */
const fakeDb = () => {
  const deleted: string[] = [];
  const row = {
    sessionId: "s1",
    accessToken: "old-access",
    refreshToken: "refresh-1",
    accessExpiresAt: new Date(Date.now() - 1000),
    updatedAt: new Date(),
  };
  const db = {
    select: () => ({ from: () => ({ where: async () => [row] }) }),
    delete: () => ({
      where: async () => {
        deleted.push("s1");
      },
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  } as unknown as Db;
  return { db, deleted };
};

const sealer: Sealer = { seal: async (v: string) => v, open: async (v: string) => v } as Sealer;

const env = readEnv({
  BETTER_AUTH_SECRET: "x".repeat(48),
  BETTER_AUTH_URL: "https://kontext.test",
  STALWART_URL: "http://stalwart:8080",
});

describe("Stalwart briefly unavailable while the access token is renewed", () => {
  it("keeps the person signed in and asks to try again", async () => {
    const { db, deleted } = fakeDb();
    const grants = createGrants(db, sealer, env.STALWART_URL, async () => ({
      status: "unavailable" as const,
    }));
    const revokeSession = vi.fn(async () => ({ status: true }));
    const auth = {
      api: {
        getSession: async () => ({ session: { id: "s1", token: "cookie-token" }, user: {} }),
        revokeSession,
      },
    } as unknown as Auth;
    const proxy = createJmapProxy(env, auth, grants);
    const response = await proxy(new Request("https://kontext.test/jmap/session"));
    // The grant survives (the commit's intent) ...
    expect(deleted).toEqual([]);
    // ... but the proxy still ends the Kontext session and answers "Anmeldung abgelaufen".
    expect(revokeSession).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });
});

describe("Stalwart unreachable (connection refused) while the token is renewed", () => {
  it("does not sign the person out when Stalwart cannot be reached", async () => {
    const { db } = fakeDb();
    const grants = createGrants(db, sealer, env.STALWART_URL);
    const revokeSession = vi.fn(async () => ({ status: true }));
    const auth = {
      api: {
        getSession: async () => ({ session: { id: "s1", token: "cookie-token" }, user: {} }),
        revokeSession,
      },
    } as unknown as Auth;
    vi.stubGlobal("fetch", async () => Promise.reject(new Error("ECONNREFUSED")));
    const proxy = createJmapProxy(env, auth, grants);
    const response = await proxy(new Request("https://kontext.test/jmap/session"));
    vi.unstubAllGlobals();
    vi.stubGlobal("Bun", { file: () => null });
    expect(response.status).toBe(503);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
