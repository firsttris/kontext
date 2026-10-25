/**
 * Phone calls through the customer's telephone box: what a call is in Kontext, how the box's
 * events move it on, who sees it and how it ends up in the list ("Verpasst", "Am Telefon
 * angenommen"). Pure.
 */
import { z } from "zod";
import { toE164 } from "./numbers";
import type { CallEvent } from "./protocol";

export const OUTCOMES = [
  "answered",
  "missed",
  "elsewhere",
  "busy",
  "unanswered",
  "failed",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type PhoneCall = {
  id: string;
  boxId: string;
  /** The box's own id for it (Kontext's id for calls dialled from Kontext). */
  boxCallId: string;
  direction: "in" | "out";
  /** The other side: E.164 when it is a number, else as delivered; "" when withheld. */
  remote: string;
  /** The own number that was called. */
  local: string;
  state: "ringing" | "talking" | "ended";
  outcome: Outcome | null;
  /** Who took it in Kontext (incoming) or dialled it (outgoing). */
  member: string | null;
  /** Who may see it and hears it ring: the line's people (incoming), the caller (outgoing). */
  members: string[];
  /** The LiveKit room of the call in Kontext, once someone is in it. */
  room: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  note: string;
};

/** Phone rooms in LiveKit: "kontext-phone-<uuid>", which LiveKit SIP's dispatch rule matches. */
export const PHONE_ROOM_PREFIX = "kontext-phone-";
export const phoneRoom = (room: string) => `${PHONE_ROOM_PREFIX}${room}`;
export const roomOfPhoneRoom = (name: string): string | null =>
  name.startsWith(PHONE_ROOM_PREFIX) ? name.slice(PHONE_ROOM_PREFIX.length) || null : null;

/** The calls state of server/calls names a phone room "phone-<uuid>". */
export const phoneCallKey = (room: string) => `phone-${room}`;

/** Hangup causes (Q.850, as Asterisk passes them on). */
const CAUSE = { busy: 17, noAnswer: 19, answeredElsewhere: 26 } as const;

const remoteOf = (raw: string) => toE164(raw) ?? raw.trim();

/** How a call that ended without being answered here is filed. */
export const outcomeOf = (
  call: Pick<PhoneCall, "direction" | "answeredAt">,
  cause?: number,
): Outcome => {
  if (call.answeredAt) return "answered";
  if (call.direction === "in") return cause === CAUSE.answeredElsewhere ? "elsewhere" : "missed";
  if (cause === CAUSE.busy) return "busy";
  if (cause === CAUSE.noAnswer) return "unanswered";
  return "failed";
};

/** A new incoming call, from the box's first "ringing". */
export const incomingCall = (
  event: CallEvent,
  { id, boxId, members }: { id: string; boxId: string; members: string[] },
): PhoneCall => ({
  id,
  boxId,
  boxCallId: event.call,
  direction: "in",
  remote: remoteOf(event.remote),
  local: remoteOf(event.local),
  state: "ringing",
  outcome: null,
  member: null,
  members,
  room: null,
  startedAt: event.at,
  answeredAt: null,
  endedAt: null,
  note: "",
});

/** A call dialled from Kontext, before the box has done anything. */
export const outgoingCall = ({
  id,
  boxId,
  member,
  remote,
  room,
  at,
}: {
  id: string;
  boxId: string;
  member: string;
  remote: string;
  room: string;
  at: string;
}): PhoneCall => ({
  id,
  boxId,
  boxCallId: id,
  direction: "out",
  remote,
  local: "",
  state: "ringing",
  outcome: null,
  member,
  members: [member],
  room,
  startedAt: at,
  answeredAt: null,
  endedAt: null,
  note: "",
});

/** The call after one of the box's events; the same call when it changes nothing (a repeat). */
export const applyCallEvent = (call: PhoneCall, event: CallEvent): PhoneCall => {
  if (call.state === "ended") return call;
  if (event.state === "answered") {
    return call.state === "talking" ? call : { ...call, state: "talking", answeredAt: event.at };
  }
  if (event.state === "ended") {
    return {
      ...call,
      state: "ended",
      endedAt: event.at,
      outcome: outcomeOf(call, event.cause),
    };
  }
  return call;
};

/** Someone took the ringing call in Kontext. */
export const takeCall = (call: PhoneCall, member: string, room: string): PhoneCall | null =>
  call.state === "ringing" &&
  call.direction === "in" &&
  !call.member &&
  call.members.includes(member)
    ? { ...call, member, room }
    : null;

export const canSeeCall = (call: Pick<PhoneCall, "members" | "member">, me: string) =>
  call.members.includes(me) || call.member === me;

/** The notification on the phones of the line's people (Web Push); a missed call replaces it. */
export const phoneNotice = (call: Pick<PhoneCall, "id" | "remote" | "outcome">) => ({
  title: call.outcome === "missed" ? "Verpasster Anruf" : "Anruf",
  body: call.remote || "Unbekannte Nummer",
  url: "/phone",
  tag: `phone-${call.id}`,
});

export const dialSchema = z.object({ number: z.string().trim().min(3).max(40) });
export const noteSchema = z.object({ note: z.string().max(2000) });
