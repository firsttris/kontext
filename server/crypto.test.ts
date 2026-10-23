// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSealer } from "./crypto";

describe("createSealer", () => {
  it("seals and opens, with a new nonce each time", async () => {
    const sealer = await createSealer("a-secret-of-at-least-thirty-two-characters", "test");
    const first = await sealer.seal("sw1.token");
    const second = await sealer.seal("sw1.token");
    expect(first).not.toBe(second);
    expect(first).not.toContain("sw1.token");
    expect(await sealer.open(first)).toBe("sw1.token");
  });

  it("refuses a value sealed with another secret or purpose", async () => {
    const sealed = await (
      await createSealer("a-secret-of-at-least-thirty-two-characters", "a")
    ).seal("x");
    await expect(
      (await createSealer("a-secret-of-at-least-thirty-two-characters", "b")).open(sealed),
    ).rejects.toThrow();
  });
});
