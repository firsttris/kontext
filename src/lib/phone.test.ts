import { describe, expect, it } from "vitest";
import {
  contactOfNumber,
  laterCall,
  outcomeText,
  type PhoneCall,
  readableNumber,
  ringingPhoneCall,
} from "./phone";

const call = (extra: Partial<PhoneCall> = {}): PhoneCall => ({
  id: "c1",
  boxId: "b1",
  boxCallId: "1.1",
  direction: "in",
  remote: "+497223123456",
  local: "",
  state: "ringing",
  outcome: null,
  member: null,
  members: ["jonas", "anna"],
  room: null,
  startedAt: "2026-10-25T09:00:00.000Z",
  answeredAt: null,
  endedAt: null,
  note: "",
  callbackTaskId: null,
  ...extra,
});

describe("contactOfNumber", () => {
  type Card = { id: string; phones?: Record<string, { number: string }> };
  const cards: Card[] = [
    { id: "a", phones: { p: { number: "+49 (0) 7223 / 12 34 56" } } },
    { id: "b", phones: { p: { number: "0172 1234567" }, w: { number: "07221 99" } } },
    { id: "c" },
  ];
  it("finds the card however the number was written", () => {
    expect(contactOfNumber(cards, "+497223123456")?.id).toBe("a");
    expect(contactOfNumber(cards, "+491721234567")?.id).toBe("b");
    expect(contactOfNumber(cards, "+4930999999")).toBeNull();
    expect(contactOfNumber(cards, "")).toBeNull();
  });
});

describe("readableNumber", () => {
  it("writes German numbers nationally and keeps others", () => {
    expect(readableNumber("+497223123456")).toBe("07223 123456");
    expect(readableNumber("+41446681800")).toBe("+41446681800");
    expect(readableNumber("")).toBe("Unbekannte Nummer");
  });
});

describe("outcomeText", () => {
  const nameOf = (id: string) => ({ anna: "Anna Weber" })[id] ?? id;
  it("says how a call went", () => {
    expect(outcomeText(call(), nameOf, "jonas")).toBe("Klingelt …");
    expect(outcomeText(call({ direction: "out" }), nameOf, "jonas")).toBe("Wählt …");
    expect(outcomeText(call({ state: "talking" }), nameOf, "jonas")).toBe("Im Gespräch");
    const ended = { state: "ended" as const };
    expect(outcomeText(call({ ...ended, outcome: "missed" }), nameOf, "jonas")).toBe("Verpasst");
    expect(outcomeText(call({ ...ended, outcome: "elsewhere" }), nameOf, "jonas")).toBe(
      "Am Telefon angenommen",
    );
    expect(
      outcomeText(call({ ...ended, outcome: "answered", member: "anna" }), nameOf, "jonas"),
    ).toBe("Angenommen von Anna Weber");
    expect(
      outcomeText(call({ ...ended, outcome: "answered", member: "jonas" }), nameOf, "jonas"),
    ).toBe("Angenommen");
    expect(
      outcomeText(call({ ...ended, outcome: "busy", direction: "out" }), nameOf, "jonas"),
    ).toBe("Besetzt");
  });
});

describe("ringingPhoneCall", () => {
  it("rings for the line's people until someone takes it or one hides it", () => {
    expect(ringingPhoneCall([call()], "jonas", [])?.id).toBe("c1");
    expect(ringingPhoneCall([call()], "max", [])).toBeNull();
    expect(ringingPhoneCall([call({ member: "anna" })], "jonas", [])).toBeNull();
    expect(ringingPhoneCall([call()], "jonas", ["c1"])).toBeNull();
    expect(ringingPhoneCall([call({ state: "ended" })], "jonas", [])).toBeNull();
  });
});

describe("laterCall", () => {
  it("keeps the newer stage when an older copy arrives last", () => {
    const talking = call({ state: "talking", member: "anna" });
    const ringing = call({ member: "anna" });
    expect(laterCall(talking, ringing)).toBe(talking);
    expect(laterCall(ringing, talking)).toBe(talking);
    expect(laterCall(undefined, ringing)).toBe(ringing);
    const noted = call({ state: "ended", note: "zurückrufen" });
    expect(laterCall(call({ state: "ended" }), noted)).toBe(noted);
  });
});
