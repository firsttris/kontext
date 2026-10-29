/**
 * An invitation in a mail: the iCalendar part (text/calendar, or an .ics file), what Stalwart
 * reads from it (CalendarEvent/parse gives JSCalendar with the iTIP `method`) and what the line
 * above the mail offers, measured against the event in the calendar with the same UID. Pure.
 */
import type { BodyPart } from "@/jmap/types";
import type { ReplyStatus } from "./invitation-reply";
import { type CalendarEvent, type Participant, participantEmail } from "./jscalendar";

/** A parsed entry: the event and the iTIP method in lower case ("request", "cancel" …). */
export type ParsedEvent = CalendarEvent & { method?: string };

/** The part to parse: the text/calendar one Outlook and Google send, else an attached .ics. */
export const invitationPart = (parts: BodyPart[]): BodyPart | undefined =>
  parts.find((part) => part.blobId && /^text\/calendar$/i.test(part.type)) ??
  parts.find(
    (part) =>
      part.blobId && (/^application\/ics$/i.test(part.type) || /\.ics$/i.test(part.name ?? "")),
  );

/**
 * The iCalendar part Outlook and Google put beside the text, without a file name: the line above
 * the mail shows it, so it is no attachment of its own. A named .ics file stays one.
 */
export const isInlineInvitation = (part: BodyPart): boolean =>
  /^text\/calendar$/i.test(part.type) && !part.name;

/** The series or single event; changed dates of a series come as entries of their own. */
export const mainEntry = (entries: ParsedEvent[]): ParsedEvent | undefined =>
  entries.find((entry) => !entry.recurrenceId) ?? entries[0];

const bare = (address: string | undefined) =>
  (address ?? "").replace(/^mailto:/i, "").toLowerCase();

export const organizerEmail = (event: CalendarEvent): string =>
  bare(event.organizerCalendarAddress);

/** The user among the attendees, by one of their addresses; not as the organizer. */
export const myAttendee = (
  event: CalendarEvent,
  addresses: string[],
): [string, Participant] | undefined => {
  const mine = new Set(addresses.map((address) => address.toLowerCase()));
  const organizer = organizerEmail(event);
  return Object.entries(event.participants ?? {}).find(([, participant]) => {
    const email = participantEmail(participant).toLowerCase();
    return email !== organizer && mine.has(email);
  });
};

export type InvitationView =
  /** An invitation (or a change of one) to answer. */
  | {
      kind: "request";
      /** Null: the user is not among the attendees (forwarded, to a list); no answer then. */
      status: Participant["participationStatus"] | null;
      inCalendar: boolean;
      /** The calendar holds a newer version (higher SEQUENCE) than this mail. */
      outdated: boolean;
    }
  /** The organizer called it off. */
  | { kind: "cancel"; inCalendar: boolean }
  /** Something to put into the calendar without answering (iTIP PUBLISH, a plain .ics). */
  | { kind: "publish"; inCalendar: boolean }
  | { kind: "none" };

/**
 * What the line shows. Own invitations (the user organizes) and answers to them (REPLY, which
 * Stalwart enters itself) show nothing.
 */
export const invitationView = (
  parsed: ParsedEvent | undefined,
  stored: CalendarEvent | undefined,
  addresses: string[],
): InvitationView => {
  if (!parsed) return { kind: "none" };
  const mine = new Set(addresses.map((address) => address.toLowerCase()));
  if (mine.has(organizerEmail(parsed))) return { kind: "none" };
  const method = parsed.method ?? "publish";
  const inCalendar = Boolean(stored);
  if (method === "cancel") return { kind: "cancel", inCalendar };
  if (method === "publish") return { kind: "publish", inCalendar };
  if (method !== "request") return { kind: "none" };
  const me = myAttendee(stored ?? parsed, addresses) ?? myAttendee(parsed, addresses);
  return {
    kind: "request",
    status: me ? (me[1].participationStatus ?? "needs-action") : null,
    inCalendar,
    outdated: Boolean(stored && (stored.sequence ?? 0) > (parsed.sequence ?? 0)),
  };
};

/**
 * The parsed event as one to create in a calendar: without what only describes the message
 * (`method`, the iCalendar leftovers), and with the user's answer when there is one.
 */
export const importableEvent = (
  parsed: ParsedEvent,
  addresses: string[],
  status?: ReplyStatus,
): Record<string, unknown> => {
  const {
    method: _method,
    id: _id,
    iCalendar: _ical,
    ...event
  } = parsed as ParsedEvent & {
    iCalendar?: unknown;
  };
  const me = status ? myAttendee(parsed, addresses) : undefined;
  return {
    ...event,
    "@type": "Event",
    ...(me
      ? {
          participants: {
            ...parsed.participants,
            [me[0]]: { ...me[1], participationStatus: status },
          },
        }
      : {}),
  };
};
