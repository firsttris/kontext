import { describe, expect, it } from "vitest";
import { nameCase, nameFix, nameFixes } from "./contact-fixes";
import type { ContactCard } from "./jscontact";

const card = (name: ContactCard["name"], extra: Partial<ContactCard> = {}): ContactCard => ({
  id: "1",
  addressBookIds: { b: true },
  name,
  ...extra,
});

const components = (given: string, surname: string) => ({
  components: [
    { kind: "given", value: given },
    { kind: "surname", value: surname },
  ],
});

describe("nameCase", () => {
  it("writes names the usual way", () => {
    expect(nameCase("MAX MUSTERMANN")).toBe("Max Mustermann");
    expect(nameCase("müller-lüdenscheidt")).toBe("Müller-Lüdenscheidt");
    expect(nameCase("anna von der heide")).toBe("Anna von der Heide");
    expect(nameCase("VAN DIJK")).toBe("Van Dijk");
    expect(nameCase("o'brien")).toBe("O'Brien");
  });
});

describe("nameFix", () => {
  it("fixes names all in capitals or all in small letters", () => {
    const shouting = card(components("MAX", "MUSTERMANN"));
    expect(nameFix(shouting)).toMatchObject({
      before: "MAX MUSTERMANN",
      after: "Max Mustermann",
      name: components("Max", "Mustermann"),
    });
    expect(nameFix(card({ full: "petra keller" }))?.after).toBe("Petra Keller");
  });

  it("leaves well written names, companies and groups alone", () => {
    expect(nameFix(card(components("Max", "Mustermann")))).toBeUndefined();
    expect(nameFix(card(components("Jean-Luc", "DE LA ROCHE")))).toBeUndefined();
    expect(
      nameFix(card({ full: "BAUHAUS" }, { organizations: { o: { name: "BAUHAUS" } } })),
    ).toBeUndefined();
    expect(nameFix(card({ full: "TEAM" }, { kind: "group" }))).toBeUndefined();
    expect(nameFix(card(undefined))).toBeUndefined();
  });

  it("lists the cards to fix", () => {
    expect(
      nameFixes([card(components("MAX", "MUSTERMANN")), card(components("Anna", "Weber"))]),
    ).toHaveLength(1);
  });
});
