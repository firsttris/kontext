// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { McpKeys } from "./keys";
import { createMcpEndpoint, createMcpKeyRoutes, type McpDeps } from "./routes";

const tokens = { accessToken: "at", refreshToken: "rt", accessExpiresAt: new Date() };

const deps = (patch: Partial<McpDeps> = {}): McpDeps => ({
  keys: {
    resolve: async (key: string) =>
      key === "kontext_good"
        ? { keyId: "k1", userId: "u1", sessionId: "s1", email: "jonas@weber-haustechnik.test" }
        : null,
    list: async () => [{ id: "k1", name: "Claude", createdAt: "x", lastUsedAt: null }],
    openSession: async () => "s2",
    create: async () => ({
      key: "kontext_new",
      info: { id: "k2", name: "Claude", createdAt: "x", lastUsedAt: null },
    }),
    remove: async (_user: string, id: string) => id === "k1",
    dropSession: async () => undefined,
  } as unknown as McpKeys,
  grants: { accessToken: async (id) => (id === "s1" ? "token" : null), save: vi.fn() },
  stalwartUrl: "http://stalwart.test",
  version: "0.1.0",
  userOf: async () => ({ id: "u1", email: "jonas@weber-haustechnik.test" }),
  login: async () => ({ status: "ok", tokens }),
  tasks: async () => [],
  ...patch,
});

const call = (key?: string) =>
  new Request("http://kontext.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("/mcp", () => {
  it("wants a known access key", async () => {
    const endpoint = createMcpEndpoint(deps());
    const missing = await endpoint(call());
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect((await endpoint(call("kontext_revoked"))).status).toBe(401);
    expect((await endpoint(call("kontext_good"))).status).toBe(200);
  });

  it("refuses a key whose Stalwart sign-in ran out", async () => {
    const endpoint = createMcpEndpoint(
      deps({ grants: { accessToken: async () => null, save: vi.fn() } }),
    );
    const response = await endpoint(call("kontext_good"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Zugang abgelaufen – bitte einen neuen Schlüssel anlegen",
    });
  });
});

describe("/api/mcp-keys", () => {
  const post = (body: unknown) =>
    new Request("http://kontext.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("lists the own keys, only when signed in", async () => {
    expect(await (await createMcpKeyRoutes(deps()).request("/")).json()).toEqual({
      keys: [{ id: "k1", name: "Claude", createdAt: "x", lastUsedAt: null }],
    });
    const signedOut = createMcpKeyRoutes(deps({ userOf: async () => null }));
    expect((await signedOut.request("/")).status).toBe(401);
  });

  it("makes a key after signing in at Stalwart again, with its own grant", async () => {
    const save = vi.fn();
    const login = vi.fn(async () => ({ status: "ok" as const, tokens }));
    const app = createMcpKeyRoutes(
      deps({ login, grants: { accessToken: async () => null, save } }),
    );
    const response = await app.request(post({ name: "Claude", password: "geheim" }));
    expect(await response.json()).toMatchObject({ status: "ok", key: "kontext_new" });
    expect(login).toHaveBeenCalledWith({
      email: "jonas@weber-haustechnik.test",
      password: "geheim",
      code: undefined,
    });
    expect(save).toHaveBeenCalledWith("s2", tokens);
  });

  it("asks for the code, and refuses a wrong password", async () => {
    const mfa = createMcpKeyRoutes(deps({ login: async () => ({ status: "mfa" }) }));
    expect(await (await mfa.request(post({ name: "C", password: "p" }))).json()).toEqual({
      status: "mfa",
    });
    const wrong = createMcpKeyRoutes(deps({ login: async () => ({ status: "failed" }) }));
    expect((await wrong.request(post({ name: "C", password: "p" }))).status).toBe(401);
    expect((await wrong.request(post({ name: "", password: "p" }))).status).toBe(400);
  });

  it("revokes only the own keys", async () => {
    const app = createMcpKeyRoutes(deps());
    expect((await app.request("/k1", { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/k9", { method: "DELETE" })).status).toBe(404);
  });
});
