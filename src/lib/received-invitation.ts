/**
 * An invitation that came by mail, as the card above the mail shows it: what the mail's
 * iCalendar part says (RFC 6047 iMIP, parsed by Stalwart) next to the event in the own calendar,
 * which Stalwart puts there itself for senders it trusts. Decides what the card offers. Pure.
 */
import type { BodyPart } from "@/jmap/types";
import { type CalendarEvent, isOrganizer, myParticipation, type Participant } from "./jscalendar";

/** An event as an iCalendar file holds it, with the iTIP method of an invitation. */
export type ParsedEvent = Omit<CalendarEvent, "id" | "calendarIds"> & {
  /** "request", "cancel", "reply" … (RFC 8984 §4.1.8); missing in a plain .ics file. */
  method?: string;
  /** Stalwart's notes on the conversion; nothing to store. */
  iCalendar?: unknown;
};

/** The iCalendar part an invitation carries (RFC 6047 §2.4: text/calendar with a method). */
export const calendarPart = (parts: BodyPart[]): BodyPart | undefined =>
  parts.find((part) => part.type.toLowerCase() === "text/calendar" && part.blobId);

/**
 * The calendar alternative of the mail's text (no name, not marked as an attachment): the card
 * stands for it, so it is no attachment card of its own. An attached invite.ics stays.
 */
export const isCalendarAlternative = (part: BodyPart): boolean =>
  part.type.toLowerCase() === "text/calendar" && !part.name && part.disposition !== "attachment";

export type Received = { method: "request" | "cancel"; event: ParsedEvent };

/**
 * The invitation or cancellation in a parsed part: the event itself, before its changed dates
 * (which come as their own VEVENTs, with a recurrenceId). Replies and plain files are none.
 */
export const receivedInvitation = (events: ParsedEvent[]): Received | null => {
  const event = events.find((one) => !one.recurrenceId) ?? events[0];
  const method = event?.method?.toLowerCase();
  return event && (method === "request" || method === "cancel") ? { method, event } : null;
};

export type InvitationCard = {
  kind: "request" | "cancel";
  /** What the mail says; the own calendar may know a newer state. */
  event: ParsedEvent;
  /** The event in the own calendar, if it is there. */
  stored: CalendarEvent | null;
  organizer: string;
  /** The user's entry, from the own calendar where it is there. */
  me: [string, Participant] | undefined;
  /** Zusagen / Vielleicht / Absagen. */
  canAnswer: boolean;
  /** A cancelled event that is still in the calendar (the whole event, as cancelled now). */
  canRemove: boolean;
  /** The organizer changed the event since this mail. */
  outdated: boolean;
};

const organizerOf = (event: ParsedEvent): string => {
  const address = (event.organizerCalendarAddress ?? "").replace(/^mailto:/i, "");
  const entry = Object.values(event.participants ?? {}).find(
    (participant) =>
      (participant.calendarAddress ?? participant.email ?? "")
        .replace(/^mailto:/i, "")
        .toLowerCase() === address.toLowerCase(),
  );
  return entry?.name || address;
};

/**
 * What the card shows, or null for none: no invitation, or one the user sent (their copy in
 * Sent). Answering needs the user among the participants and an event to answer: the one in the
 * calendar, or the invitation itself, which then goes into the calendar (a single date of a
 * series alone can't).
 */
export const invitationCard = ({
  received,
  stored,
  mine,
}: {
  received: Received | null;
  stored: CalendarEvent | null;
  mine: string[];
}): InvitationCard | null => {
  if (!received) return null;
  const { method, event } = received;
  const asEvent = { ...event, id: "", calendarIds: {} } as CalendarEvent;
  if (!event.organizerCalendarAddress || isOrganizer(asEvent, mine)) return null;
  const me = myParticipation(stored ?? asEvent, mine);
  const outdated = Boolean(stored && (stored.sequence ?? 0) > (event.sequence ?? 0));
  const cancelled = method === "cancel" || stored?.status === "cancelled";
  return {
    kind: method,
    event,
    stored,
    organizer: organizerOf(event),
    me,
    canAnswer: !cancelled && Boolean(me) && Boolean(stored || !event.recurrenceId),
    // A cancelled single date is not the series stored under the UID, and a cancellation older
    // than the stored event was overtaken by a new invitation: removing would lose either.
    canRemove: method === "cancel" && Boolean(stored) && !event.recurrenceId && !outdated,
    outdated,
  };
};

/** The event as it goes into the own calendar, without what only the file had. */
export const importable = ({
  method: _method,
  iCalendar: _iCalendar,
  ...event
}: ParsedEvent): Record<string, unknown> => event;
