import { describe, expect, it } from "vitest";
import {
  domainOf,
  externalAddresses,
  isDomain,
  isExternal,
  newExternalAttendees,
  normalDomain,
  parseDomains,
} from "./external-hint";

const inside = ["weber-haustechnik.test", "Partner-Bau.de"];

describe("isExternal", () => {
  it("counts the own domains and the partner domains as inside", () => {
    expect(isExternal("anna@weber-haustechnik.test", inside)).toBe(false);
    expect(isExternal("ANNA@Weber-Haustechnik.TEST", inside)).toBe(false);
    expect(isExternal("chef@partner-bau.de", inside)).toBe(false);
    expect(isExternal("kunde@example.test", inside)).toBe(true);
  });

  it("covers subdomains, but not a domain that only ends alike", () => {
    expect(isExternal("info@mail.partner-bau.de", inside)).toBe(false);
    expect(isExternal("info@nicht-partner-bau.de", inside)).toBe(true);
  });

  it("compares a domain with umlauts in either spelling (Unicode or punycode)", () => {
    // Mail arrives with the ASCII form (RFC 5890), people type the Unicode form, or vice versa.
    expect(isExternal("chef@xn--mller-bau-q9a.de", ["müller-bau.de"])).toBe(false);
    expect(isExternal("chef@müller-bau.de", ["xn--mller-bau-q9a.de"])).toBe(false);
    expect(isExternal("info@mail.xn--mller-bau-q9a.de", ["Müller-Bau.de"])).toBe(false);
    expect(isExternal("chef@xn--mller-bau-q9a.de", ["muller-bau.de"])).toBe(true);
  });

  it("marks nothing without a domain", () => {
    expect(isExternal("undisclosed-recipients", inside)).toBe(false);
    expect(isExternal("", inside)).toBe(false);
  });

  it("finds everybody outside when nothing is inside", () => {
    expect(isExternal("anna@weber-haustechnik.test", [])).toBe(true);
  });
});

describe("externalAddresses", () => {
  it("names each address outside once, in the order given", () => {
    expect(
      externalAddresses(
        ["kunde@example.test", "anna@weber-haustechnik.test", "Kunde@Example.test", "b@x.test"],
        inside,
      ),
    ).toEqual(["kunde@example.test", "b@x.test"]);
  });
});

describe("newExternalAttendees", () => {
  it("asks only about attendees outside who were not invited before", () => {
    expect(
      newExternalAttendees(
        ["kunde@example.test", "neu@example.test", "anna@weber-haustechnik.test"],
        ["Kunde@example.test"],
        inside,
      ),
    ).toEqual(["neu@example.test"]);
  });
});

describe("domains", () => {
  it("takes the domain of an address in lower case", () => {
    expect(domainOf("Anna@Weber-Haustechnik.Test")).toBe("weber-haustechnik.test");
    expect(domainOf("ohne-at")).toBe("");
  });

  it("writes a domain the way people type it in one form", () => {
    expect(normalDomain("  @Partner-Bau.DE. ")).toBe("partner-bau.de");
  });

  it("tells domains from other text", () => {
    expect(isDomain("partner-bau.de")).toBe(true);
    expect(isDomain("müller-bau.de")).toBe(true);
    expect(isDomain("localhost")).toBe(false);
    expect(isDomain("-bau.de")).toBe(false);
    expect(isDomain("a b.de")).toBe(false);
  });

  it("reads a list of domains and names what is none", () => {
    expect(parseDomains("partner-bau.de, @steuerbuero.de\nPartner-Bau.de; kein domain")).toEqual({
      domains: ["partner-bau.de", "steuerbuero.de"],
      invalid: ["kein", "domain"],
    });
  });
});
