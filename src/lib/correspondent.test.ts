import { describe, expect, it } from "vitest";
import { contactFormFor, correspondent, findContact } from "./correspondent";
import type { ContactCard } from "./jscontact";

const own = ["jonas@weber.test", "info@weber.test"];
const petra = { name: "Petra Keller", email: "petra@keller.test" };

describe("correspondent", () => {
  it("is the sender of a received mail", () => {
    expect(correspondent({ from: [petra], to: [{ name: null, email: own[0]! }] }, own)).toBe(petra);
  });

  it("is the first other recipient of a mail sent from an own address, info@ too", () => {
    const sent = {
      from: [{ name: null, email: "INFO@weber.test" }],
      to: [{ name: null, email: "jonas@weber.test" }],
      cc: [petra],
    };
    expect(correspondent(sent, own)).toBe(petra);
    expect(correspondent({ from: [{ name: null, email: own[0]! }], to: [] }, own)).toBeUndefined();
  });
});

describe("findContact", () => {
  it("finds a card by any of its addresses, ignoring case", () => {
    const card = {
      id: "c1",
      addressBookIds: {},
      emails: { a: { address: "buero@keller.test" }, b: { address: "Petra@Keller.test" } },
    } as ContactCard;
    expect(findContact([card], "petra@keller.test")).toBe(card);
    expect(findContact([card], "other@keller.test")).toBeUndefined();
  });
});

describe("contactFormFor", () => {
  it("splits the name into given name and surname", () => {
    expect(contactFormFor(petra)).toMatchObject({
      given: "Petra",
      surname: "Keller",
      email: petra.email,
    });
    expect(contactFormFor({ name: "Anna Maria Weber", email: "a@w.test" })).toMatchObject({
      given: "Anna Maria",
      surname: "Weber",
    });
    expect(contactFormFor({ name: "Buchhaltung", email: "b@w.test" })).toMatchObject({
      given: "Buchhaltung",
      surname: "",
    });
    expect(contactFormFor({ name: null, email: "b@w.test" })).toMatchObject({ given: "" });
  });
});
