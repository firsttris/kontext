import { describe, expect, it } from "vitest";
import { cardKey, eventUid, prepareCard, splitVCards } from "./items";

describe("contacts", () => {
  it("knows a card again by name and first address", () => {
    expect(
      cardKey({ name: { full: " Petra Keller " }, emails: { e: { address: "P@Keller.de" } } }),
    ).toBe("petra keller|p@keller.de");
    expect(
      cardKey({ name: { components: [{ value: "Petra" }, { value: "Keller" }] }, emails: {} }),
    ).toBe("petra keller|");
  });

  it("goes into the address book with a uid", () => {
    const card = prepareCard({ id: "x", name: { full: "A" }, addressBookIds: { o: true } }, "b");
    expect(card).toMatchObject({ "@type": "Card", addressBookIds: { b: true } });
    expect(card.id).toBeUndefined();
    expect(card.uid).toEqual(expect.any(String));
  });
});

describe("events", () => {
  it("replaces readpst's numbers by a stable uid", () => {
    expect(eventUid("0x1268", "pst-abc")).toBe("pst-abc");
    expect(eventUid("040000008200E000@outlook", "pst-abc")).toBe("040000008200E000@outlook");
    expect(eventUid(undefined, "pst-abc")).toBe("pst-abc");
  });
});

describe("splitVCards", () => {
  it("splits Google's export into one text per contact", () => {
    const file = "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:B\r\nEND:VCARD\r\n";
    expect(splitVCards(file)).toEqual([
      "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD",
      "BEGIN:VCARD\r\nFN:B\r\nEND:VCARD",
    ]);
    expect(splitVCards("nichts")).toEqual([]);
  });
});
