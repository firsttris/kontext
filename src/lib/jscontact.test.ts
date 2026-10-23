import { describe, expect, it } from "vitest";
import {
  type ContactCard,
  contactAddresses,
  formToCard,
  fullName,
  indexLetter,
  matchesSearch,
  sortKey,
  toForm,
} from "./jscontact";

const petra: ContactCard = {
  id: "c1",
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: "Petra" },
      { kind: "surname", value: "Keller" },
    ],
    isOrdered: true,
  },
  organizations: { o1: { name: "Keller Elektro" } },
  emails: { e1: { address: "petra@keller.test", contexts: { work: true } } },
  phones: { p1: { number: "+49 7223 1", features: { voice: true } } },
  addresses: {
    a1: {
      components: [
        { kind: "name", value: "Industriestraße 4" },
        { kind: "locality", value: "77815 Bühl" },
      ],
    },
  },
  notes: { n1: { note: "Wartung" } },
};

describe("reading cards", () => {
  it("builds name, form and search", () => {
    expect(fullName(petra)).toBe("Petra Keller");
    expect(toForm(petra)).toEqual({
      given: "Petra",
      surname: "Keller",
      company: "Keller Elektro",
      email: "petra@keller.test",
      phone: "+49 7223 1",
      street: "Industriestraße 4",
      city: "77815 Bühl",
      note: "Wartung",
    });
    expect(matchesSearch(petra, "elektro")).toBe(true);
    expect(matchesSearch(petra, "hoffmann")).toBe(false);
    expect(sortKey(petra)).toBe("keller petra");
    expect(indexLetter(petra)).toBe("K");
  });
  it("falls back to the company when there is no name", () => {
    expect(
      fullName({ id: "x", addressBookIds: {}, organizations: { o: { name: "Stadtwerke" } } }),
    ).toBe("Stadtwerke");
  });
  it("lists the addresses for suggestions", () => {
    expect(contactAddresses([petra])).toEqual([
      { name: "Petra Keller", email: "petra@keller.test" },
    ]);
  });
});

describe("formToCard", () => {
  it("keeps the keys of existing entries", () => {
    const card = formToCard({ ...toForm(petra), email: "neu@keller.test", note: "" }, petra);
    expect(card.emails).toEqual({ e1: { address: "neu@keller.test", contexts: { work: true } } });
    expect(card.notes).toBeUndefined();
    expect(card.organizations).toEqual({ o1: { name: "Keller Elektro" } });
  });
  it("uses the company as name when no person is given", () => {
    const card = formToCard({ ...toForm(petra), given: "", surname: "" });
    expect(card.name).toEqual({ full: "Keller Elektro" });
  });
});
