import { describe, expect, it } from "vitest";
import { parseAddresses, prefixSubject, replyRecipients } from "./addresses";

describe("parseAddresses", () => {
  it("reads names, plain addresses and separators", () => {
    expect(
      parseAddresses(
        'Petra Keller <petra@keller.test>, info@weber.test; "Braun, Sabine" <sb@braun.test>',
      ),
    ).toEqual({
      addresses: [
        { name: "Petra Keller", email: "petra@keller.test" },
        { name: null, email: "info@weber.test" },
        { name: "Braun, Sabine", email: "sb@braun.test" },
      ],
      invalid: [],
    });
  });
  it("reports what is not an address", () => {
    expect(parseAddresses("petra, x@y.test").invalid).toEqual(["petra"]);
  });
});

describe("replyRecipients", () => {
  const me = "jonas@weber.test";
  const original = {
    from: [{ name: "Petra", email: "petra@keller.test" }],
    to: [
      { name: "Jonas", email: me },
      { name: "Anna", email: "anna@weber.test" },
    ],
    cc: [{ name: null, email: "buero@keller.test" }],
    replyTo: null,
  };
  it("answers the sender", () => {
    expect(replyRecipients(original, [me], false)).toEqual({ to: [original.from[0]], cc: [] });
  });
  it("answers everyone except me", () => {
    const { to, cc } = replyRecipients(original, [me], true);
    expect(to.map((a) => a.email)).toEqual(["petra@keller.test"]);
    expect(cc.map((a) => a.email)).toEqual(["anna@weber.test", "buero@keller.test"]);
  });
  it("uses Reply-To when set", () => {
    const { to } = replyRecipients(
      { ...original, replyTo: [{ name: null, email: "noreply-answers@keller.test" }] },
      [me],
      false,
    );
    expect(to[0]!.email).toBe("noreply-answers@keller.test");
  });
  it("answers my own recipients when I wrote the original", () => {
    const { to } = replyRecipients(
      { ...original, from: [{ name: "Jonas", email: me }] },
      [me],
      false,
    );
    expect(to.map((a) => a.email)).toEqual(["anna@weber.test"]);
  });
});

describe("prefixSubject", () => {
  it("adds the prefix once", () => {
    expect(prefixSubject("Re", "Angebot")).toBe("Re: Angebot");
    expect(prefixSubject("Re", "AW: Angebot")).toBe("AW: Angebot");
    expect(prefixSubject("Fwd", "WG: Angebot")).toBe("WG: Angebot");
    expect(prefixSubject("Fwd", null)).toBe("Fwd: ");
  });
});
