import { describe, expect, it } from "vitest";
import {
  answeredCallbacks,
  applyCallEvent,
  callbackTask,
  canSeeCall,
  dialTarget,
  incomingCall,
  isPerson,
  offerCall,
  outcomeOf,
  outgoingCall,
  phoneNotice,
  phoneRoom,
  roomIsOver,
  roomOfPhoneRoom,
  takeCall,
  takeOffer,
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

  it("leaves the ringing when the caller is on the mailbox, and files it as missed", () => {
    const mailbox = applyCallEvent(ringing(), event("mailbox"));
    expect(mailbox.state).toBe("mailbox");
    expect(applyCallEvent(mailbox, event("ended", { cause: 16 })).outcome).toBe("missed");
    const talking = applyCallEvent(ringing(), event("answered"));
    expect(applyCallEvent(talking, event("mailbox"))).toBe(talking);
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

describe("callbackTask", () => {
  const now = new Date("2026-10-25T10:00:00.000Z");
  it("is due today on the chosen board, linked to the missed call", () => {
    const missed = { id: "c1", remote: "+497223123456", startedAt: now.toISOString() };
    const task = callbackTask({ ...missed, outcome: "missed" }, "info", now);
    expect(task).toMatchObject({
      accountId: "info",
      title: "Zurückrufen: 07223 123456",
      dueDate: "2026-10-25",
      assigneeId: null,
      links: [{ kind: "call", ref: "c1", detail: "Verpasster Anruf · 25. Okt., 11:00" }],
    });
    expect(callbackTask({ ...missed, outcome: "answered" }, "info", now)).toBeNull();
    expect(callbackTask({ ...missed, remote: "", outcome: "missed" }, "info", now)).toBeNull();
  });

  it("is done when the number was talked to again, in or out", () => {
    const missed = { ...ringing(), callbackTaskId: "t1" };
    const other = { ...ringing(), id: "c9", remote: "+4930123456", callbackTaskId: "t2" };
    const talked = { ...ringing(), id: "c2", state: "talking" as const };
    expect(answeredCallbacks([missed, other], talked)).toEqual([missed]);
    expect(answeredCallbacks([missed], { ...talked, state: "ringing" })).toEqual([]);
  });
});

describe("handing on", () => {
  const talking = { ...applyCallEvent(takeCall(ringing(), "jonas", "r1")!, event("answered")) };

  it("offers a call one talks on and lets the colleague take it", () => {
    expect(offerCall(ringing(), "jonas", "anna")).toBeNull();
    expect(offerCall(talking, "anna", "max")).toBeNull();
    expect(offerCall(talking, "jonas", "jonas")).toBeNull();
    const offered = offerCall(talking, "jonas", "max")!;
    expect(canSeeCall(offered, "max")).toBe(true);
    expect(takeOffer(offered, "anna")).toBeNull();
    expect(takeOffer(offered, "max")).toMatchObject({
      member: "max",
      members: ["jonas", "anna", "max"],
      offeredTo: null,
      offeredBy: null,
    });
  });

  it("knows people from LiveKit SIP's lines and when a room is over", () => {
    expect(isPerson("jonas")).toBe(true);
    expect(isPerson("sip_07223123456")).toBe(false);
    expect(roomIsOver(["jonas"], [talking])).toBe(false);
    expect(roomIsOver([], [talking, talking])).toBe(false);
    expect(roomIsOver(["jonas"], [])).toBe(true);
    expect(roomIsOver([], [talking])).toBe(true);
  });

  it("dials numbers the Fritzbox's way and its own telephones by their internal number", () => {
    expect(dialTarget("0171 2345678")).toEqual({ remote: "+491712345678", dial: "01712345678" });
    expect(dialTarget("**610")).toEqual({ remote: "**610", dial: "**610" });
    expect(dialTarget("** 611")).toEqual({ remote: "**611", dial: "**611" });
    expect(dialTarget("*610")).toBeNull();
    expect(dialTarget("abc")).toBeNull();
  });
});
