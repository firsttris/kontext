// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Connections, McpCaller } from "./connections";
import { createMcpEndpoint, createMcpKeyRoutes, type McpDeps } from "./routes";

const tokens = { accessToken: "at", refreshToken: "rt", accessExpiresAt: new Date() };
const caller: McpCaller = {
  connectionId: "k1",
  userId: "u1",
  sessionId: "s1",
  email: "jonas@weber-haustechnik.test",
  scopes: ["read"],
  clientId: null,
};
const info = {
  id: "k2",
  name: "Claude",
  kind: "key" as const,
  scopes: ["read" as const],
  createdAt: "x",
  lastUsedAt: null,
  recent: [],
};

const connections = (patch: Partial<Connections> = {}) =>
  ({
    resolveKey: async (key: string) => (key === "kontext_good" ? caller : null),
    list: async () => [info],
    openSession: async () => "s2",
    createKey: vi.fn(async () => ({ key: "kontext_new", info })),
    remove: async (_user: string, id: string) =>
      id === "k1" ? { clientId: null } : id === "o1" ? { clientId: "claude" } : null,
    dropSession: async () => undefined,
    writesSince: async () => 0,
    log: async () => undefined,
    ...patch,
  }) as unknown as Connections;

const deps = (patch: Partial<McpDeps> = {}): McpDeps => ({
  connections: connections(),
  grants: { accessToken: async (id) => (id === "s1" ? "token" : null), save: vi.fn() },
  stalwartUrl: "http://stalwart.test",
  version: "0.1.0",
  userOf: async () => ({ id: "u1", email: "jonas@weber-haustechnik.test" }),
  login: async () => ({ status: "ok", tokens }),
  tasksFor: () => async () => ({ status: 200, body: { tasks: [] } }),
  mayTryPassword: () => true,
  ...patch,
});

const call = (token?: string) =>
  new Request("http://kontext.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
    expect((await endpoint(call("eyJ.some.jwt"))).status).toBe(401);
    expect((await endpoint(call("kontext_good"))).status).toBe(200);
  });

  it("hands everything that is no access key to OAuth, including its challenge", async () => {
    const challenge = new Response(null, {
      status: 401,
      headers: { "www-authenticate": "Bearer resource_metadata=x" },
    });
    const oauthCaller = vi.fn(async (_request: Request, token: string | null) =>
      token === "eyJ.good" ? caller : token ? null : challenge,
    );
    const endpoint = createMcpEndpoint(deps({ oauthCaller }));
    expect((await endpoint(call())).headers.get("www-authenticate")).toBe(
      "Bearer resource_metadata=x",
    );
    expect((await endpoint(call("eyJ.good"))).status).toBe(200);
    expect((await endpoint(call("eyJ.bad"))).status).toBe(401);
    expect((await endpoint(call("kontext_good"))).status).toBe(200);
    expect(oauthCaller).not.toHaveBeenCalledWith(expect.anything(), "kontext_good");
  });

  it("refuses a connection whose Stalwart sign-in ran out", async () => {
    const endpoint = createMcpEndpoint(
      deps({ grants: { accessToken: async () => null, save: vi.fn() } }),
    );
    const response = await endpoint(call("kontext_good"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Zugang abgelaufen – bitte den Agenten neu verbinden",
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

  it("lists the own connections, only when signed in", async () => {
    expect(await (await createMcpKeyRoutes(deps()).request("/")).json()).toEqual({
      connections: [info],
    });
    const signedOut = createMcpKeyRoutes(deps({ userOf: async () => null }));
    expect((await signedOut.request("/")).status).toBe(401);
  });

  it("makes a key after signing in at Stalwart again, with its own grant and rights", async () => {
    const save = vi.fn();
    const login = vi.fn(async () => ({ status: "ok" as const, tokens }));
    const own = connections();
    const app = createMcpKeyRoutes(
      deps({ login, connections: own, grants: { accessToken: async () => null, save } }),
    );
    const response = await app.request(post({ name: "Claude", password: "geheim", write: true }));
    expect(await response.json()).toMatchObject({ status: "ok", key: "kontext_new" });
    expect(login).toHaveBeenCalledWith({
      email: "jonas@weber-haustechnik.test",
      password: "geheim",
      code: undefined,
    });
    expect(save).toHaveBeenCalledWith("s2", tokens);
    expect(own.createKey).toHaveBeenCalledWith("u1", "s2", "Claude", ["read", "write"]);
    await app.request(post({ name: "Nur lesen", password: "geheim" }));
    expect(own.createKey).toHaveBeenLastCalledWith("u1", "s2", "Nur lesen", ["read"]);
  });

  it("lets nobody guess the password: tries count like signing in", async () => {
    const login = vi.fn(async () => ({ status: "failed" as const }));
    const app = createMcpKeyRoutes(deps({ login, mayTryPassword: () => false }));
    const response = await app.request(post({ name: "C", password: "p" }));
    expect(response.status).toBe(429);
    expect(login).not.toHaveBeenCalled();
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

  it("revokes only the own connections; an OAuth client loses its tokens too", async () => {
    const revokeClient = vi.fn(async () => undefined);
    const app = createMcpKeyRoutes({ ...deps(), revokeClient });
    expect((await app.request("/k1", { method: "DELETE" })).status).toBe(200);
    expect(revokeClient).not.toHaveBeenCalled();
    expect((await app.request("/o1", { method: "DELETE" })).status).toBe(200);
    expect(revokeClient).toHaveBeenCalledWith("u1", "claude");
    expect((await app.request("/k9", { method: "DELETE" })).status).toBe(404);
  });
});
