// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFailureLimit } from "./failures";

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
