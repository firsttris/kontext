/**
 * Phone calls through the customer's telephone box: what a call is in Kontext, how the box's
 * events move it on, who sees it and how it ends up in the list ("Verpasst", "Am Telefon
 * angenommen"). Pure.
 */
import { z } from "zod";
import { companyDay, type NewTaskData } from "../tasks/tasks";
import { readableNumber, toDialable, toE164 } from "./numbers";
import type { CallEvent } from "./protocol";

export const OUTCOMES = [
  "answered",
  "missed",
  "elsewhere",
  "busy",
  "unanswered",
  "failed",
  /** Outside the opening hours. */
  "closed",
  /** On the block list: turned away by the box. */
  "blocked",
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
  /** "mailbox": nobody took it, the caller is on the mailbox. */
  state: "ringing" | "talking" | "mailbox" | "ended";
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
  /** The task "Zurückrufen" a missed call made; cleared once someone talked to the number. */
  callbackTaskId: string | null;
  /** How long the message is that the caller left on the mailbox. */
  voicemailSeconds: number | null;
  /** Handed over: the colleague it rings for, and who hands it over. */
  offeredTo: string | null;
  offeredBy: string | null;
  /** Not handed over but asked to join (Rückfrage, three-way): the call stays with offeredBy. */
  offeredJoin: boolean;
  /** The line outside hears music, out of the room. */
  held: boolean;
  /** The people of Kontext in its room now (LiveKit's webhooks); not stored. */
  present: string[];
  /** Answered at the forwarding number (a mobile phone) while it rang in Kontext. */
  forwardedTo: string | null;
  /** The extra number it came in on or went out with (its name, "Durchwahl Anna"); null: the first. */
  line: string | null;
  /** The desk phone at the box it was answered at or dialled from (its name). */
  desk: string | null;
  /** What the caller chose in the voice menu ("Kundendienst"). */
  topic: string | null;
};

/** Phone rooms in LiveKit: "kontext-phone-<uuid>", which LiveKit SIP's dispatch rule matches. */
export const PHONE_ROOM_PREFIX = "kontext-phone-";
export const phoneRoom = (room: string) => `${PHONE_ROOM_PREFIX}${room}`;
export const roomOfPhoneRoom = (name: string): string | null =>
  name.startsWith(PHONE_ROOM_PREFIX) ? name.slice(PHONE_ROOM_PREFIX.length) || null : null;

/** The calls state of server/calls names a phone room "phone-<uuid>". */
export const phoneCallKey = (room: string) => `phone-${room}`;

/** Whether someone takes calls: Bitte nicht stören, or away (until a time, or open-ended). */
export type PhoneStatus = {
  memberId: string;
  mode: "available" | "dnd" | "away";
  until: string | null;
};

export const statusSchema = z.object({
  mode: z.enum(["available", "dnd", "away"]),
  until: z.iso.datetime().nullable().default(null),
});

/** Who does not take calls at `now`: an away that has run out counts as back. */
export const unavailableAt = (statuses: PhoneStatus[], now: Date): string[] =>
  statuses
    .filter(
      (status) =>
        status.mode === "dnd" ||
        (status.mode === "away" && (!status.until || Date.parse(status.until) > now.getTime())),
    )
    .map((status) => status.memberId);

/** The plan without who does not take calls: the others ring (in order, as before). */
export const withoutUnavailable = (plan: RingPlan, unavailable: string[]): RingPlan => ({
  ...plan,
  order: plan.order.filter((member) => !unavailable.includes(member)),
});

/** How the line's people hear a call: all at once, or one after another (then all). */
export type RingPlan = { mode: "all" | "order"; stepSeconds: number; order: string[] };

/** Who hears a ringing call `seconds` after it started. Pure. */
export const ringingFor = (plan: RingPlan, seconds: number): string[] => {
  if (plan.mode === "all") return plan.order;
  const step = Math.floor(seconds / plan.stepSeconds);
  return step >= plan.order.length ? plan.order : plan.order.slice(step, step + 1);
};

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
  callbackTaskId: null,
  voicemailSeconds: null,
  offeredTo: null,
  offeredBy: null,
  offeredJoin: false,
  held: false,
  present: [],
  forwardedTo: null,
  line: null,
  desk: null,
  topic: null,
});

/** A call outside the opening hours: filed at once, it never rings. */
export const closedCall = (
  event: CallEvent,
  ids: { id: string; boxId: string; members: string[] },
): PhoneCall => ({ ...incomingCall(event, ids), state: "mailbox", outcome: "closed" });

/** A call the box turned away (block list): filed as over at once. */
export const blockedCall = (
  event: CallEvent,
  ids: { id: string; boxId: string; members: string[] },
): PhoneCall => ({
  ...incomingCall(event, ids),
  state: "ended",
  outcome: "blocked",
  endedAt: event.at,
});

export const blockSchema = z.object({ number: z.string().trim().min(3).max(40) });

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
  callbackTaskId: null,
  voicemailSeconds: null,
  offeredTo: null,
  offeredBy: null,
  offeredJoin: false,
  held: false,
  present: [],
  forwardedTo: null,
  line: null,
  desk: null,
  topic: null,
});

/** The call after one of the box's events; the same call when it changes nothing (a repeat). */
export const applyCallEvent = (
  call: PhoneCall,
  event: CallEvent,
  forwardTo: string | null = null,
): PhoneCall => {
  if (call.state === "ended") return call;
  if (event.state === "answered") {
    if (call.state === "talking") return call;
    const forwardedTo = event.forwarded ? forwardTo : null;
    return { ...call, state: "talking", answeredAt: event.at, forwardedTo };
  }
  if (event.state === "mailbox") {
    return call.state === "ringing" ? { ...call, state: "mailbox" } : call;
  }
  if (event.state === "ended") {
    return {
      ...call,
      state: "ended",
      endedAt: event.at,
      // A call outside the hours stays that.
      outcome: call.outcome ?? outcomeOf(call, event.cause),
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

export const canSeeCall = (call: Pick<PhoneCall, "members" | "member" | "offeredTo">, me: string) =>
  call.members.includes(me) || call.member === me || call.offeredTo === me;

/**
 * Hand a call one is talking on to a colleague, or ask them to join it (`join`); it rings for
 * them until they take it.
 */
export const offerCall = (
  call: PhoneCall,
  me: string,
  to: string,
  join = false,
): PhoneCall | null =>
  call.state === "talking" && call.member === me && to !== me
    ? { ...call, offeredTo: to, offeredBy: me, offeredJoin: join }
    : null;

/** The colleague takes the call: handed over, it is theirs now; asked to join, they are in it. */
export const takeOffer = (call: PhoneCall, me: string): PhoneCall | null =>
  call.state === "talking" && call.offeredTo === me
    ? {
        ...call,
        member: call.offeredJoin ? call.member : me,
        members: [...new Set([...call.members, me])],
        offeredTo: null,
        offeredBy: null,
        offeredJoin: false,
      }
    : null;

/** Who sits in a phone room: LiveKit SIP's participants are "sip_…", the rest are people. */
export const isPerson = (identity: string) => !identity.startsWith("sip_");

/**
 * Whether a room's calls should end: when at most one side is left – people of Kontext in the
 * room plus the lines still connected (the caller, a colleague's mobile phone …).
 */
export const roomIsOver = (present: string[], liveCalls: PhoneCall[]) =>
  present.length + liveCalls.length <= 1;

/**
 * Where a call is handed or dialled to: a number (E.164 for the list, national for the
 * Fritzbox), a telephone at the Fritzbox itself ("**610" for the first DECT handset) or a desk
 * phone at the box by its short number.
 */
export const dialTarget = (
  raw: string,
  deskExtensions: string[] = [],
): { remote: string; dial: string } | null => {
  const internal = raw.replace(/\s/g, "");
  if (/^\*\*\d{2,4}$/.test(internal) || deskExtensions.includes(internal)) {
    return { remote: internal, dial: internal };
  }
  const remote = toE164(raw);
  return remote ? { remote, dial: toDialable(remote) } : null;
};

/** The notification on the phones of the line's people (Web Push); a missed call replaces it. */
export const phoneNotice = (call: Pick<PhoneCall, "id" | "remote" | "outcome">) => ({
  title: call.outcome === "missed" ? "Verpasster Anruf" : "Anruf",
  body: call.remote || "Unbekannte Nummer",
  url: "/phone",
  tag: `phone-${call.id}`,
});

const timeOfDay = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The task a missed call leaves on the chosen board, due today and linked to the call; none for a
 * withheld number, which nobody can call back.
 */
export const callbackTask = (
  call: Pick<PhoneCall, "id" | "remote" | "startedAt" | "outcome">,
  board: string,
  now: Date,
): NewTaskData | null => {
  if ((call.outcome !== "missed" && call.outcome !== "closed") || !toE164(call.remote)) return null;
  const number = readableNumber(call.remote);
  return {
    accountId: board,
    title: `Zurückrufen: ${number}`,
    notes: "",
    status: "open",
    assigneeId: null,
    dueDate: companyDay(now),
    dueTime: null,
    checklist: [],
    links: [
      {
        kind: "call",
        accountId: board,
        ref: call.id,
        threadId: null,
        label: number,
        detail: `${call.outcome === "closed" ? "Außerhalb der Öffnungszeiten" : "Verpasster Anruf"} · ${timeOfDay(call.startedAt)}`,
      },
    ],
    remindAt: null,
    repeat: null,
  };
};

/** Someone talked to the number again: the missed calls whose callback task is now done. */
export const answeredCallbacks = (calls: PhoneCall[], talked: PhoneCall): PhoneCall[] =>
  talked.state === "talking"
    ? calls.filter(
        (call) => call.id !== talked.id && call.callbackTaskId && call.remote === talked.remote,
      )
    : [];

export const dialSchema = z.object({ number: z.string().trim().min(3).max(40) });
/** To a colleague (`to`) or to a number (`number`), one of the two. */
export const transferSchema = z.union([
  z.object({ to: z.string().min(1).max(64), join: z.boolean().default(false) }),
  z.object({ number: z.string().trim().min(3).max(40) }),
]);
export const noteSchema = z.object({ note: z.string().max(2000) });
