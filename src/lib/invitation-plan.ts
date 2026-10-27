/**
 * Who hears what after the organizer saved or deleted an event (RFC 5546 §3.2): new attendees an
 * invitation, the others the change when it matters to them, those taken off and everyone when
 * it is deleted a cancellation. Like Stalwart's own scheduling (crates/groupware/src/scheduling,
 * `send_update_messages`), whoever declined hears no more of changes, and past events go
 * without mail (`ItipSendStatus::EventInPast`). Pure.
 */
import { type CalendarEvent, eventTimes, type Participant, participantEmail } from "./jscalendar";

/** "removed": taken off an event that goes on (a CANCEL to them alone, RFC 5546 §3.2.5). */
export type InvitationKind = "invite" | "update" | "cancel" | "removed";

export type PlannedInvitation = {
  kind: InvitationKind;
  /** Lower case. */
  email: string;
  name: string | null;
  /** The event as the message shows it: after the change, or as it was for a cancellation. */
  event: CalendarEvent;
};

const lower = (address: string) => address.replace(/^mailto:/i, "").toLowerCase();

/** The organizer's address, without "mailto:", lower case; "" when the event names none. */
export const organizerOf = (event: CalendarEvent): string =>
  lower(event.organizerCalendarAddress ?? "");

/** The attendees besides the organizer, by address. */
export const attendeesOf = (event: CalendarEvent | null): Map<string, Participant> =>
  new Map(
    Object.values(event?.participants ?? {})
      .filter(
        (participant) =>
          participant.roles?.attendee !== false &&
          participantEmail(participant) &&
          lower(participantEmail(participant)) !== organizerOf(event!),
      )
      .map((participant) => [lower(participantEmail(participant)), participant]),
  );

/** Key order fixed, so that the same content compares equal. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

/** The answers of attendees are theirs: they come back in overrides of a series too. */
const withoutAnswers = (overrides: CalendarEvent["recurrenceOverrides"]) =>
  Object.fromEntries(
    Object.entries(overrides ?? {}).map(([id, patch]) => [
      id,
      Object.fromEntries(Object.entries(patch).filter(([key]) => !key.startsWith("participants"))),
    ]),
  );

const essence = (event: CalendarEvent) =>
  stable({
    title: event.title ?? "",
    description: event.description ?? "",
    start: event.start,
    timeZone: event.timeZone ?? null,
    duration: event.duration ?? "",
    showWithoutTime: Boolean(event.showWithoutTime),
    locations: Object.values(event.locations ?? {}).map((location) => location.name ?? ""),
    virtualLocations: Object.values(event.virtualLocations ?? {}).map((place) => place.uri ?? ""),
    links: Object.values(event.links ?? {}).map((link) => link.href),
    recurrenceRule: event.recurrenceRule ?? null,
    recurrenceOverrides: withoutAnswers(event.recurrenceOverrides),
  });

/**
 * Did the organizer change what attendees agreed to: time, place, title, notes, repetition?
 * Then SEQUENCE goes up and they hear of it; answers and who else comes do not count.
 */
export const isSignificantChange = (before: CalendarEvent, after: CalendarEvent): boolean =>
  essence(before) !== essence(after);

/**
 * Does SEQUENCE go up? For a significant change, and when attendees come or go: whoever was
 * taken off holds a CANCEL with the next number, and an invitation that brings them back must not
 * be below it (RFC 5546 §2.1.4; Stalwart counts up on attendee changes too, and its inbound side
 * turns an older one away as OutOfSequence, crates/groupware/src/scheduling/inbound.rs).
 */
export const raisesSequence = (before: CalendarEvent, after: CalendarEvent): boolean => {
  const was = [...attendeesOf(before).keys()].sort().join();
  const is = [...attendeesOf(after).keys()].sort().join();
  return was !== is || isSignificantChange(before, after);
};

/** A single event that has ended; a series always has a date to come (as far as we know). */
const isPast = (event: CalendarEvent, now: Date) =>
  !event.recurrenceRule &&
  eventTimes({ ...event, utcStart: undefined, utcEnd: undefined }).end <= now;

const message = (
  kind: InvitationKind,
  email: string,
  participant: Participant,
  event: CalendarEvent,
): PlannedInvitation => ({ kind, email, name: participant.name ?? null, event });

/**
 * The messages for the change from `before` (null: just created) to `after` (null: deleted), sent
 * as one of `mine` (the organizer's addresses the user may send as); none when someone else
 * organizes the event.
 */
export const planInvitations = ({
  before,
  after,
  mine,
  now,
}: {
  before: CalendarEvent | null;
  after: CalendarEvent | null;
  mine: string[];
  now: Date;
}): PlannedInvitation[] => {
  const current = after ?? before;
  if (!current || !mine.map(lower).includes(organizerOf(current))) return [];
  if (isPast(current, now)) return [];
  const was = attendeesOf(before);
  const is = attendeesOf(after);
  // A cancellation counts as a change of its own (RFC 5546 §2.1.4; Stalwart's itip_cancel too).
  const called = before && { ...before, sequence: (before.sequence ?? 0) + 1 };
  if (!after) {
    return [...was].map(([email, participant]) => message("cancel", email, participant, called!));
  }
  const changed = before ? isSignificantChange(before, after) : false;
  return [
    ...[...is].flatMap(([email, participant]) => {
      if (!was.has(email)) return [message("invite", email, participant, after)];
      if (changed && participant.participationStatus !== "declined") {
        return [message("update", email, participant, after)];
      }
      return [];
    }),
    ...[...was]
      .filter(([email]) => !is.has(email))
      .map(([email, participant]) => message("removed", email, participant, called!)),
  ];
};
