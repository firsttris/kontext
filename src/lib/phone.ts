/**
 * Phone calls as the app shows them: whose number it is (from the address books), how a call
 * ended, and numbers in a readable form. Pure; what a call is: server/phone/phone.ts.
 */
import { m } from "@/paraglide/messages";
import { readableNumber as readable, toE164 } from "../../server/phone/numbers";
import type { PhoneCall } from "../../server/phone/phone";
import type { ContactCard } from "./jscontact";

export type { PhoneCall };
export { toE164 };

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
  if (call.state === "talking") return m.phone_talking();
  switch (call.outcome) {
    case "answered":
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
    default:
      return m.phone_outcome_failed();
  }
};

/** The call that rings here now: incoming, nobody took it, I am one of its people. */
export const ringingPhoneCall = (
  calls: PhoneCall[],
  me: string,
  dismissed: string[],
): PhoneCall | null =>
  calls.find(
    (call) =>
      call.direction === "in" &&
      call.state === "ringing" &&
      !call.member &&
      call.members.includes(me) &&
      !dismissed.includes(call.id),
  ) ?? null;

const STAGE: Record<PhoneCall["state"], number> = { ringing: 0, talking: 1, ended: 2 };

/**
 * Which of two copies of a call to keep: the live update and the answer to a request can arrive
 * in either order, and an older stage must not undo a newer one.
 */
export const laterCall = (current: PhoneCall | undefined, next: PhoneCall): PhoneCall =>
  current && STAGE[current.state] > STAGE[next.state] ? current : next;
