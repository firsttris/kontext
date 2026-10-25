// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashKey, keyFromHeader, newKey } from "./keys";

describe("MCP access keys", () => {
  it("are long, random and recognisable", () => {
    const key = newKey();
    expect(key).toMatch(/^kontext_[\w-]{43}$/);
    expect(newKey()).not.toBe(key);
  });

  it("are stored as a hash that is the same each time", async () => {
    const key = newKey();
    expect(await hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashKey(key)).toBe(await hashKey(key));
    expect(await hashKey(key)).not.toBe(await hashKey(newKey()));
  });

  it("come as a bearer token, and only ours count", () => {
    expect(keyFromHeader("Bearer kontext_abc")).toBe("kontext_abc");
    expect(keyFromHeader("bearer   kontext_abc")).toBe("kontext_abc");
    expect(keyFromHeader("Bearer eyJhbGciOi")).toBeNull();
    expect(keyFromHeader("Basic a29udGV4dA==")).toBeNull();
    expect(keyFromHeader(null)).toBeNull();
  });
});
