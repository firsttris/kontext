import { describe, expect, it } from "vitest";
import { sameNumber, toDialable, toE164 } from "./numbers";

describe("toE164", () => {
  it("drops the trunk 0 written after the country code", () => {
    expect(toE164("+49 07223 123456")).toBe("+497223123456");
    expect(toE164("0049 07223 123456")).toBe("+497223123456");
  });

  it("reads German numbers however they were written", () => {
    expect(toE164("07223 12 34 56")).toBe("+497223123456");
    expect(toE164("+49 (0) 7223/123456")).toBe("+497223123456");
    expect(toE164("0049 7223 123456")).toBe("+497223123456");
    expect(toE164("+49-172-1234567")).toBe("+491721234567");
  });

  it("keeps foreign numbers", () => {
    expect(toE164("0041 44 668 18 00")).toBe("+41446681800");
    expect(toE164("+43 1 234567")).toBe("+431234567");
  });

  it("is not a number for extensions, local numbers without area code or text", () => {
    expect(toE164("**610")).toBeNull();
    expect(toE164("123456")).toBeNull();
    expect(toE164("anonymous")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("+0123456789")).toBeNull();
  });
});

describe("toDialable", () => {
  it("dials German numbers with 0, others with 00", () => {
    expect(toDialable("+497223123456")).toBe("07223123456");
    expect(toDialable("+41446681800")).toBe("0041446681800");
  });
});

describe("sameNumber", () => {
  it("finds the same line in two spellings", () => {
    expect(sameNumber("07223 123456", "+49 7223 12 34 56")).toBe(true);
    expect(sameNumber("07223 123456", "07223 123457")).toBe(false);
    expect(sameNumber("**610", "**610")).toBe(false);
  });
});
