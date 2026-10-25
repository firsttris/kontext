// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientOf, grantedScopes, mcpResource } from "./oauth";
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
