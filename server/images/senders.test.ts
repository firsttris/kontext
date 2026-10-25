// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CONTACTS, senderSchema, trusts } from "./senders";

describe("pictures by sender", () => {
  it("trusts an address, a whole domain, or the contacts", () => {
    expect(trusts(["news@shop.test"], "News@Shop.test", false)).toBe(true);
    expect(trusts(["@shop.test"], "info@shop.test", false)).toBe(true);
    expect(trusts(["@shop.test"], "info@other.test", false)).toBe(false);
    expect(trusts([CONTACTS], "petra@keller.test", true)).toBe(true);
    expect(trusts([CONTACTS], "petra@keller.test", false)).toBe(false);
    expect(trusts([], "", false)).toBe(false);
  });

  it("takes addresses, domains and the contacts, in lower case", () => {
    expect(senderSchema.parse(" News@Shop.TEST ")).toBe("news@shop.test");
    expect(senderSchema.parse("@shop.test")).toBe("@shop.test");
    expect(senderSchema.parse("@contacts")).toBe("@contacts");
    expect(senderSchema.safeParse("shop").success).toBe(false);
    expect(senderSchema.safeParse("@").success).toBe(false);
  });
});
