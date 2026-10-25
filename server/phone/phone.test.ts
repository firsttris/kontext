import { describe, expect, it } from "vitest";
import {
  applyCallEvent,
  canSeeCall,
  incomingCall,
  outcomeOf,
  outgoingCall,
  phoneNotice,
  phoneRoom,
  roomOfPhoneRoom,
  takeCall,
} from "./phone";
import type { CallEvent } from "./protocol";

const event = (state: CallEvent["state"], extra: Partial<CallEvent> = {}): CallEvent => ({
  type: "event",
  seq: 1,
  call: "1729850000.12",
  state,
  direction: "in",
  remote: "07223 123456",
  local: "07223 99999",
  at: "2026-10-25T09:00:00.000Z",
  ...extra,
});

const ringing = () =>
  incomingCall(event("ringing"), { id: "c1", boxId: "b1", members: ["jonas", "anna"] });

describe("incomingCall", () => {
  it("starts ringing for the line's people, with the numbers in E.164", () => {
    expect(ringing()).toMatchObject({
      id: "c1",
      boxCallId: "1729850000.12",
      direction: "in",
      remote: "+497223123456",
      local: "+49722399999",
      state: "ringing",
      members: ["jonas", "anna"],
      member: null,
    });
  });

  it("keeps a withheld number empty", () => {
    const call = incomingCall(event("ringing", { remote: "" }), {
      id: "c1",
      boxId: "b1",
      members: [],
    });
    expect(call.remote).toBe("");
  });
});

describe("applyCallEvent", () => {
  it("files an answered call with its times", () => {
    const talking = applyCallEvent(
      ringing(),
      event("answered", { at: "2026-10-25T09:00:05.000Z" }),
    );
    expect(talking).toMatchObject({ state: "talking", answeredAt: "2026-10-25T09:00:05.000Z" });
    const ended = applyCallEvent(
      talking,
      event("ended", { at: "2026-10-25T09:03:00.000Z", cause: 16 }),
    );
    expect(ended).toMatchObject({
      state: "ended",
      outcome: "answered",
      endedAt: "2026-10-25T09:03:00.000Z",
    });
  });

  it("tells a missed call from one taken at a desk phone", () => {
    expect(applyCallEvent(ringing(), event("ended", { cause: 16 })).outcome).toBe("missed");
    expect(applyCallEvent(ringing(), event("ended", { cause: 26 })).outcome).toBe("elsewhere");
  });

  it("ignores repeats and anything after the end", () => {
    const talking = applyCallEvent(ringing(), event("answered"));
    expect(applyCallEvent(talking, event("answered", { at: "2026-10-25T10:00:00.000Z" }))).toBe(
      talking,
    );
    const ended = applyCallEvent(talking, event("ended"));
    expect(applyCallEvent(ended, event("answered"))).toBe(ended);
  });
});

describe("outcomeOf an outgoing call", () => {
  const out = { direction: "out" as const, answeredAt: null };
  it("says busy, no answer or failed", () => {
    expect(outcomeOf(out, 17)).toBe("busy");
    expect(outcomeOf(out, 19)).toBe("unanswered");
    expect(outcomeOf(out, 38)).toBe("failed");
    expect(outcomeOf({ ...out, answeredAt: "x" }, 16)).toBe("answered");
  });
});

describe("takeCall", () => {
  it("lets one of the line's people take a ringing call once", () => {
    const taken = takeCall(ringing(), "anna", "r1");
    expect(taken).toMatchObject({ member: "anna", room: "r1" });
    expect(takeCall(taken!, "jonas", "r2")).toBeNull();
    expect(takeCall(ringing(), "max", "r1")).toBeNull();
    expect(takeCall(applyCallEvent(ringing(), event("ended")), "anna", "r1")).toBeNull();
  });
});

describe("outgoingCall", () => {
  it("belongs to who dialled it", () => {
    const call = outgoingCall({
      id: "c2",
      boxId: "b1",
      member: "jonas",
      remote: "+497223123456",
      room: "r2",
      at: "2026-10-25T09:00:00.000Z",
    });
    expect(call).toMatchObject({
      boxCallId: "c2",
      direction: "out",
      members: ["jonas"],
      room: "r2",
    });
    expect(canSeeCall(call, "jonas")).toBe(true);
    expect(canSeeCall(call, "anna")).toBe(false);
  });
});

describe("rooms and notices", () => {
  it("names phone rooms for LiveKit SIP's dispatch rule", () => {
    expect(phoneRoom("abc")).toBe("kontext-phone-abc");
    expect(roomOfPhoneRoom("kontext-phone-abc")).toBe("abc");
    expect(roomOfPhoneRoom("kontext-abc")).toBeNull();
  });

  it("rings with the number and replaces it when missed", () => {
    expect(phoneNotice({ id: "c1", remote: "+497223123456", outcome: null })).toEqual({
      title: "Anruf",
      body: "+497223123456",
      url: "/phone",
      tag: "phone-c1",
    });
    expect(phoneNotice({ id: "c1", remote: "", outcome: "missed" })).toMatchObject({
      title: "Verpasster Anruf",
      body: "Unbekannte Nummer",
    });
  });
});
