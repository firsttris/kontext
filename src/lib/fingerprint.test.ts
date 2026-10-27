import { describe, expect, it } from "vitest";
import { groupFingerprint } from "./fingerprint";

describe("groupFingerprint", () => {
  it("groups a fingerprint in fours", () => {
    expect(groupFingerprint("ABCD1234EF56")).toBe("ABCD 1234 EF56");
    expect(groupFingerprint("ABCD12")).toBe("ABCD 12");
  });
});
