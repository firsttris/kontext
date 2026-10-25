/**
 * Phone calls as the app shows them: whose number it is (from the address books), how a call
 * ended, and numbers in a readable form. Pure; what a call is: server/phone/phone.ts.
 */
import { m } from "@/paraglide/messages";
import { readableNumber as readable, toE164 } from "../../server/phone/numbers";
import {
  type PhoneCall,
  type RingPlan,
  ringingFor,
  withoutUnavailable,
} from "../../server/phone/phone";
import type { ContactCard } from "./jscontact";

export type { PhoneCall, RingPlan };
export { toE164, withoutUnavailable };

/** The contact a number belongs to, comparing every number of every card. */
export const contactOfNumber = <C extends Pick<ContactCard, "phones">>(
  contacts: C[],
  number: string,
): C | null => {
  const wanted = toE164(number);
  if (!wanted) return null;
  return (
    contacts.find((card) =>
      Object.values(card.phones ?? {}).some((phone) => toE164(phone.number) === wanted),
    ) ?? null
  );
};

/** "+497223123456" → "07223 123456" for German numbers; others stay international. */
export const readableNumber = (number: string): string =>
  number ? readable(number) : m.phone_unknown();

/** How a call ended, for the list. */
export const outcomeText = (
  call: PhoneCall,
  nameOf: (id: string) => string,
  me: string,
): string => {
  if (call.state === "ringing")
    return call.direction === "in" ? m.phone_ringing() : m.phone_dialing();
  if (call.state === "talking") {
    return call.forwardedTo
      ? m.phone_outcome_forwarded({ number: readableNumber(call.forwardedTo) })
      : m.phone_talking();
  }
  if (call.state === "mailbox") {
    return call.outcome === "closed" ? m.phone_outcome_closed() : m.phone_on_mailbox();
  }
  switch (call.outcome) {
    case "answered":
      if (call.desk && call.direction === "in") return m.phone_outcome_desk({ name: call.desk });
      if (call.forwardedTo) {
        return m.phone_outcome_forwarded({ number: readableNumber(call.forwardedTo) });
      }
      return call.direction === "in" && call.member && call.member !== me
        ? m.phone_outcome_answered_by({ name: nameOf(call.member) })
        : m.phone_outcome_answered();
    case "missed":
      return m.phone_outcome_missed();
    case "elsewhere":
      return m.phone_outcome_elsewhere();
    case "busy":
      return m.phone_outcome_busy();
    case "unanswered":
      return m.phone_outcome_unanswered();
    case "closed":
      return m.phone_outcome_closed();
    case "blocked":
      return m.phone_outcome_blocked();
    default:
      return m.phone_outcome_failed();
  }
};

/**
 * The call that rings here now: incoming, nobody took it, I am one of its people – and, when they
 * ring one after another, it is my turn.
 */
export const ringingPhoneCall = (
  calls: PhoneCall[],
  me: string,
  dismissed: string[],
  plan: RingPlan | null = null,
  now: Date = new Date(),
): PhoneCall | null =>
  calls.find(
    (call) =>
      call.direction === "in" &&
      call.state === "ringing" &&
      !call.member &&
      call.members.includes(me) &&
      !dismissed.includes(call.id) &&
      // The plan is the first line's; a direct number rings for all its people at once.
      (!plan ||
        call.line !== null ||
        ringingFor(plan, (now.getTime() - Date.parse(call.startedAt)) / 1000).includes(me)),
  ) ?? null;

/** A call a colleague hands to me, waiting for me to take it. */
export const offeredPhoneCall = (calls: PhoneCall[], me: string): PhoneCall | null =>
  calls.find((call) => call.state === "talking" && call.offeredTo === me) ?? null;

/** The other lines in a call's room: numbers dialled in to hand it on. */
export const linesOf = (calls: PhoneCall[], call: PhoneCall): PhoneCall[] =>
  calls.filter(
    (other) => other.id !== call.id && other.room === call.room && other.state !== "ended",
  );

/** The call went to a colleague who is in its room now: I may go. */
export const handedOver = (call: PhoneCall, me: string) =>
  Boolean(call.member && call.member !== me && call.present.includes(call.member));

const STAGE: Record<PhoneCall["state"], number> = { ringing: 0, mailbox: 1, talking: 1, ended: 2 };

/**
 * Which of two copies of a call to keep: the live update and the answer to a request can arrive
 * in either order, and an older stage must not undo a newer one.
 */
export const laterCall = (current: PhoneCall | undefined, next: PhoneCall): PhoneCall =>
  current && STAGE[current.state] > STAGE[next.state] ? current : next;
