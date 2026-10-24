import { describe, expect, it } from "vitest";
import { cardKey, eventUid, prepareCard, prepareEvent } from "./items";

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

  it("goes into the calendar without Outlook's NONE category", () => {
    expect(
      prepareEvent({ title: "T", keywords: { NONE: true }, calendarIds: { x: true } }, "c", "u"),
    ).toEqual({ title: "T", uid: "u", calendarIds: { c: true } });
  });
});
