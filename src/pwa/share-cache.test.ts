import { describe, expect, it } from "vitest";
import { isShare } from "./share-cache";

describe("the share target", () => {
  const origin = "https://kontext.firma.test";
  it("takes what the system's share sheet or Kontext itself sends", () => {
    expect(isShare("", origin)).toBe(true);
    expect(isShare("about:client", origin)).toBe(true);
    expect(isShare(`${origin}/mail`, origin)).toBe(true);
  });
  it("turns away a form on another site", () => {
    expect(isShare("https://evil.test/page", origin)).toBe(false);
    expect(isShare("https://dokumente.firma.test/", origin)).toBe(false);
  });
});
