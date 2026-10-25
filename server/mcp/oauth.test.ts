// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { clientOf, createOAuthCaller, grantedScopes, mcpResource } from "./oauth";
import { acceptedScopes } from "./oauth-routes";

describe("OAuth for agents", () => {
  it("binds tokens to the MCP address", () => {
    expect(mcpResource("https://mail.weber.de")).toBe("https://mail.weber.de/mcp");
    expect(mcpResource("https://mail.weber.de/")).toBe("https://mail.weber.de/mcp");
  });

  it("grants what the person allowed, as far as the token carries it", () => {
    expect(grantedScopes("read write", "openid offline_access read write")).toEqual([
      "read",
      "write",
    ]);
    // Allowed to write, but the token was not given "write": reading only.
    expect(grantedScopes("read write", "openid read")).toEqual(["read"]);
    // The token says "write", the person did not allow it.
    expect(grantedScopes("read", "read write")).toEqual(["read"]);
    expect(grantedScopes("read", undefined)).toEqual(["read"]);
  });

  it("knows the client a token was issued to", () => {
    expect(clientOf({ azp: "claude" })).toBe("claude");
    expect(clientOf({ client_id: "cli" })).toBe("cli");
    expect(clientOf({ sub: "u1" })).toBeNull();
  });

  it("accepts the scopes asked for, writing only when allowed", () => {
    expect(acceptedScopes("openid offline_access read write", false)).toBe(
      "openid offline_access read",
    );
    expect(acceptedScopes("openid offline_access read write", true)).toBe(
      "openid offline_access read write",
    );
    expect(acceptedScopes(null, true)).toBe("");
  });
});

describe("the caller behind an OAuth token", () => {
  const challenge = () =>
    new Response(null, {
      status: 401,
      headers: { "www-authenticate": "Bearer resource_metadata=x" },
    });
  const verify = async (request: Request) =>
    request.headers.get("authorization")
      ? { sub: "u1", azp: "claude", scope: "read write" }
      : challenge();
  const call = new Request("http://kontext.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer eyJ.token" },
  });
  const caller = {
    connectionId: "c1",
    userId: "u1",
    sessionId: "s1",
    email: "jonas@weber-haustechnik.test",
    scopes: ["read" as const, "write" as const],
    clientId: "claude",
  };

  it("is the person's connection to that client, with what both allow", async () => {
    const revokeClient = vi.fn(async () => undefined);
    const resolveClient = vi.fn(async () => caller);
    const found = await createOAuthCaller({ connections: { resolveClient }, revokeClient, verify })(
      call,
    );
    expect(found).toEqual(caller);
    expect(resolveClient).toHaveBeenCalledWith("u1", "claude");
    expect(revokeClient).not.toHaveBeenCalled();
  });

  it("takes a consent away that outlived its connection, so the person is asked again", async () => {
    // All sessions ended (new password, locked): the connection went, Better Auth's consent stayed.
    const revokeClient = vi.fn(async () => undefined);
    const answer = await createOAuthCaller({
      connections: { resolveClient: async () => null },
      revokeClient,
      verify,
    })(call);
    expect(revokeClient).toHaveBeenCalledWith("u1", "claude");
    expect(answer).toBeInstanceOf(Response);
    expect((answer as Response).headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("passes on the challenge for a missing or bad token", async () => {
    const answer = await createOAuthCaller({
      connections: { resolveClient: async () => caller },
      revokeClient: async () => undefined,
      verify,
    })(new Request("http://kontext.test/mcp", { method: "POST" }));
    expect((answer as Response).status).toBe(401);
  });
});
