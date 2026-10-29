// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashAppPassword, looksLikeAppPassword, newAppPassword } from "./app-passwords";

describe("app passwords", () => {
  it("are five groups of four, without look-alike characters, and random", () => {
    const password = newAppPassword();
    expect(password).toMatch(/^([a-z2-9]{4}-){4}[a-z2-9]{4}$/);
    expect(password).not.toMatch(/[01ilo]/);
    expect(newAppPassword()).not.toBe(password);
    expect(looksLikeAppPassword(password)).toBe(true);
    expect(looksLikeAppPassword("kaffee-werkbank-kontext")).toBe(false);
  });

  it("skip bytes that would make some letters likelier", () => {
    // 248 and above are dropped (248 = 8 × 31): only the zeros count, "a" each.
    let call = 0;
    const random = (length: number) => new Uint8Array(length).fill(call++ === 0 ? 250 : 0);
    expect(newAppPassword(random)).toBe("aaaa-aaaa-aaaa-aaaa-aaaa");
  });

  it("are kept as a hash that is the same each time", async () => {
    const password = newAppPassword();
    expect(await hashAppPassword(password)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAppPassword(password)).toBe(await hashAppPassword(password));
    expect(await hashAppPassword(password)).not.toBe(await hashAppPassword(newAppPassword()));
  });
});
