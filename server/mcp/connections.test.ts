// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bearerToken, hashKey, isAccessKey, newKey, parseScopes } from "./connections";

describe("MCP connections", () => {
  it("make long, random, recognisable access keys", () => {
    const key = newKey();
    expect(key).toMatch(/^kontext_[\w-]{43}$/);
    expect(newKey()).not.toBe(key);
    expect(isAccessKey(key)).toBe(true);
    expect(isAccessKey("eyJhbGciOiJFZERTQSJ9.e30.x")).toBe(false);
  });

  it("store a key as a hash that is the same each time", async () => {
    const key = newKey();
    expect(await hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashKey(key)).toBe(await hashKey(key));
    expect(await hashKey(key)).not.toBe(await hashKey(newKey()));
  });

  it("take the bearer token from the header", () => {
    expect(bearerToken("Bearer kontext_abc")).toBe("kontext_abc");
    expect(bearerToken("bearer   eyJ.x.y")).toBe("eyJ.x.y");
    expect(bearerToken("Basic a29udGV4dA==")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("always grant reading, writing only when given", () => {
    expect(parseScopes("read")).toEqual(["read"]);
    expect(parseScopes("read write")).toEqual(["read", "write"]);
    expect(parseScopes("write")).toEqual(["read", "write"]);
    expect(parseScopes("send admin")).toEqual(["read"]);
    expect(parseScopes(null)).toEqual(["read"]);
  });
});
