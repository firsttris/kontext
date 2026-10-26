// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFailureLimit, loginKey } from "./failures";

describe("failed password checks", () => {
  it("block a key after so many failures within the window, then let it go again", () => {
    let now = 0;
    const limit = createFailureLimit(3, 60_000, () => now);
    limit.failed("anna");
    limit.failed("anna");
    expect(limit.blocked("anna")).toBe(false);
    limit.failed("anna");
    expect(limit.blocked("anna")).toBe(true);
    // Another key has its own count.
    expect(limit.blocked("jonas")).toBe(false);
    now = 60_001;
    expect(limit.blocked("anna")).toBe(false);
  });

  it("forget the failures of a key once its password was right", () => {
    const limit = createFailureLimit(2, 60_000, () => 0);
    limit.failed("anna");
    limit.cleared("anna");
    limit.failed("anna");
    expect(limit.blocked("anna")).toBe(false);
  });
});

describe("the same wrong attempt again", () => {
  it("counts once, while new ones count each", () => {
    const limit = createFailureLimit(3, 60_000, () => 0);
    for (let i = 0; i < 10; i++) limit.failed("client:office", "old-password");
    expect(limit.blocked("client:office")).toBe(false);
    limit.failed("client:office", "guess-1");
    limit.failed("client:office", "guess-2");
    expect(limit.blocked("client:office")).toBe(true);
  });
});

describe("login names", () => {
  it("count as one with or without the domain, in any case", () => {
    expect(loginKey("Jonas@Firma.de")).toBe(loginKey("jonas"));
    expect(loginKey(" jonas ")).toBe(loginKey("jonas@firma.de"));
    expect(loginKey("anna@firma.de")).not.toBe(loginKey("jonas@firma.de"));
  });
});
