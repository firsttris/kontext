// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mayReplace } from "./kept-keys";

describe("replacing a kept key", () => {
  const wkd = { fingerprint: "A", source: "wkd" };
  const autocrypt = (fingerprint: string) => ({ fingerprint, source: "autocrypt" });

  it("lets a key from a mail in only where none or one from a mail was kept", () => {
    expect(mayReplace(undefined, autocrypt("B"), "autocrypt")).toBe(true);
    expect(mayReplace(wkd, autocrypt("B"), "autocrypt")).toBe(false);
    expect(mayReplace(wkd, autocrypt("A"), "autocrypt")).toBe(true);
    expect(mayReplace(autocrypt("A"), autocrypt("B"), "autocrypt")).toBe(true);
  });

  it("lets someone replace a key on purpose", () => {
    expect(mayReplace(wkd, { fingerprint: "B", source: "import" }, "autocrypt")).toBe(true);
  });
});
