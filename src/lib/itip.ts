/**
 * An event as iCalendar for an invitation by mail (iTIP, RFC 5546; iMIP, RFC 6047): REQUEST for a
 * new or changed event, CANCEL when it is called off or an attendee is taken off. Gmail, Outlook
 * and Apple show their own buttons for it, and their REPLY goes back to the organizer's Stalwart,
 * which enters it into the event (crates/email/src/message/ingest.rs). A colleague's Stalwart
 * puts a REQUEST from the own server straight into their calendar the same way.
 *
 * Built from the JSCalendar event Stalwart returns: JMAP has no export to iCalendar
 * (crates/jmap-proto/src/request/method.rs knows only CalendarEvent/parse, the other way round,
 * and an event has no blobId). The mapping follows RFC 8984 and draft-ietf-calext-jscalendar-icalendar
 * as calcard does it for Stalwart's CalDAV (jscalendar/export/convert.rs). Pure.
 */
import { fold, paramValue, utcStamp, writeText } from "./ical-text";
import { vtimezone } from "./ical-zone";
import {
  addDays,
  type CalendarEvent,
  durationMinutes,
  fromLocal,
  type Participant,
  participantEmail,
  shiftLocal,
} from "./jscalendar";
import type { RecurrenceRule } from "./recurrence";

export type ItipMethod = "REQUEST" | "CANCEL";

const PARTSTAT: Record<NonNullable<Participant["participationStatus"]>, string> = {
  "needs-action": "NEEDS-ACTION",
  accepted: "ACCEPTED",
  declined: "DECLINED",
  tentative: "TENTATIVE",
  delegated: "DELEGATED",
};

const isUtc = (zone: string | null | undefined) => zone === "Etc/UTC" || zone === "UTC";

/** "2026-11-20T10:00:00" → "20261120T100000". */
const compact = (local: string) => local.replace(/[-:]/g, "").slice(0, 15);
const compactDay = (local: string) => local.slice(0, 10).replace(/-/g, "");

/**
 * A local date-time of the event as a property: a DATE for all-day events, with TZID in the
 * event's zone, in UTC for UTC, floating without a zone.
 */
const timeProp = (name: string, local: string, event: CalendarEvent) => {
  if (event.showWithoutTime) return `${name};VALUE=DATE:${compactDay(local)}`;
  if (isUtc(event.timeZone)) return `${name}:${compact(local)}Z`;
  if (event.timeZone) return `${name};TZID=${paramValue(event.timeZone)}:${compact(local)}`;
  return `${name}:${compact(local)}`;
};

/**
 * DTSTART and DTEND. An all-day event ends on the day after its last one (DTEND is exclusive);
 * a timed one on the wall clock of its zone, as Stalwart writes DTEND (calcard export/convert.rs).
 */
const times = (event: CalendarEvent): string[] => {
  const minutes = durationMinutes(event.duration);
  const end = event.showWithoutTime
    ? `${addDays(event.start.slice(0, 10), Math.max(1, Math.ceil(minutes / 1440)))}T00:00:00`
    : shiftLocal(event.start, minutes);
  return [timeProp("DTSTART", event.start, event), timeProp("DTEND", end, event)];
};

/**
 * RRULE (RFC 5545 §3.3.10), FREQ first as older clients want it. UNTIL is a DATE for all-day
 * events and in UTC when DTSTART has a zone; JSCalendar keeps it as a local date-time.
 */
export const rrule = (rule: RecurrenceRule, event: CalendarEvent): string => {
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) {
    parts.push(
      `BYDAY=${rule.byDay.map((day) => `${day.nthOfPeriod ?? ""}${day.day.toUpperCase()}`).join(",")}`,
    );
  }
  if (rule.byMonthDay?.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    parts.push(
      `UNTIL=${
        event.showWithoutTime
          ? compactDay(rule.until)
          : event.timeZone
            ? utcStamp(fromLocal(rule.until, event.timeZone))
            : compact(rule.until)
      }`,
    );
  }
  return `RRULE:${parts.join(";")}`;
};

const address = (participant: Participant) => `mailto:${participantEmail(participant)}`;

const isOrganizerOf = (event: CalendarEvent, participant: Participant) =>
  participantEmail(participant).toLowerCase() ===
  (event.organizerCalendarAddress ?? "").replace(/^mailto:/i, "").toLowerCase();

const organizerLine = (event: CalendarEvent) => {
  const organizer = Object.values(event.participants ?? {}).find((p) => isOrganizerOf(event, p));
  const email = (event.organizerCalendarAddress ?? "").replace(/^mailto:/i, "");
  return `ORGANIZER${organizer?.name ? `;CN=${paramValue(organizer.name)}` : ""}:mailto:${email}`;
};

/** An attendee: the organizer as CHAIR (who goes), the others with their answer so far. */
const attendeeLine = (event: CalendarEvent, participant: Participant) => {
  const organizer = isOrganizerOf(event, participant);
  const status = participant.participationStatus ?? (organizer ? "accepted" : "needs-action");
  const params = [
    ...(participant.name ? [`CN=${paramValue(participant.name)}`] : []),
    `ROLE=${organizer ? "CHAIR" : "REQ-PARTICIPANT"}`,
    `PARTSTAT=${PARTSTAT[status]}`,
    ...(!organizer && participant.expectReply !== false ? ["RSVP=TRUE"] : []),
  ];
  return `ATTENDEE;${params.join(";")}:${address(participant)}`;
};

const isAttendee = (participant: Participant) =>
  participant.roles?.attendee !== false && Boolean(participantEmail(participant));

/**
 * The event's own properties: what it is, where and who. `only` keeps the attendees whom a
 * CANCEL concerns (those taken off); the organizer stays.
 */
const eventProps = (event: CalendarEvent, only?: Set<string>): string[] => {
  const people = Object.values(event.participants ?? {}).filter(
    (participant) =>
      isAttendee(participant) &&
      (!only ||
        isOrganizerOf(event, participant) ||
        only.has(participantEmail(participant).toLowerCase())),
  );
  return [
    ...times(event),
    ...(event.title ? [`SUMMARY:${writeText(event.title)}`] : []),
    ...(event.description ? [`DESCRIPTION:${writeText(event.description)}`] : []),
    ...Object.values(event.locations ?? {})
      .filter((location) => location.name)
      .slice(0, 1)
      .map((location) => `LOCATION:${writeText(location.name!)}`),
    ...Object.values(event.virtualLocations ?? {})
      // Web addresses only: mail programs make the place a link.
      .filter((place) => /^https?:\/\//i.test(place.uri ?? ""))
      .map(
        (place) =>
          `CONFERENCE;VALUE=URI;FEATURE=VIDEO${place.name ? `;LABEL=${paramValue(place.name)}` : ""}:${place.uri}`,
      ),
    ...Object.values(event.links ?? {}).map(
      (link) =>
        `LINK;LINKREL=related;VALUE=URI${link.title ? `;LABEL=${paramValue(link.title)}` : ""}:${link.href}`,
    ),
    `TRANSP:${event.freeBusyStatus === "free" ? "TRANSPARENT" : "OPAQUE"}`,
    ...(event.organizerCalendarAddress ? [organizerLine(event)] : []),
    ...people.map((participant) => attendeeLine(event, participant)),
  ];
};

/** A JSON pointer as JSCalendar patches use them (RFC 8984 §1.4.9), "~1" for "/". */
const pathOf = (pointer: string) =>
  pointer.split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));

/** The event with a patch of `recurrenceOverrides` applied: one date as it differs. */
export const applyPatch = <T extends object>(base: T, patch: Record<string, unknown>): T => {
  const result = structuredClone(base) as Record<string, unknown>;
  for (const [pointer, value] of Object.entries(patch)) {
    const path = pathOf(pointer);
    let target = result;
    for (const key of path.slice(0, -1)) {
      const next = target[key];
      target[key] = next && typeof next === "object" ? { ...(next as object) } : {};
      target = target[key] as Record<string, unknown>;
    }
    const last = path[path.length - 1]!;
    if (value === null) delete target[last];
    else target[last] = value;
  }
  return result as T;
};

const component = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];

export type ItipOptions = {
  method: ItipMethod;
  /** DTSTAMP: when the message was made. */
  now: Date;
  /** For a CANCEL to some: their addresses (lower case); without, it concerns everyone. */
  only?: string[];
};

/**
 * The whole iCalendar object: the series with its rule and excluded dates, a VEVENT per changed
 * date (RECURRENCE-ID), and the VTIMEZONE the times name. A CANCEL keeps the times and the title
 * so that the recipient's program finds and names the event, and says STATUS:CANCELLED.
 */
export const toICalendar = (event: CalendarEvent, { method, now, only }: ItipOptions): string => {
  const uid = event.uid ?? event.id;
  const sequence = event.sequence ?? 0;
  const concerned = only && new Set(only.map((email) => email.toLowerCase()));
  const head = (stamp: CalendarEvent) => [
    `UID:${uid}`,
    `SEQUENCE:${stamp.sequence ?? sequence}`,
    `DTSTAMP:${utcStamp(now)}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
  ];
  const overrides = Object.entries(event.recurrenceOverrides ?? {});
  const excluded = overrides.filter(([, patch]) => patch.excluded === true);
  // A CANCEL calls off the whole series; its changed dates go with it.
  const changed =
    event.recurrenceRule && method === "REQUEST"
      ? overrides.filter(([, patch]) => patch.excluded !== true)
      : [];
  const series = [
    ...head(event),
    ...eventProps(event, concerned),
    ...(event.recurrenceRule ? [rrule(event.recurrenceRule, event)] : []),
    ...(event.recurrenceRule
      ? excluded.map(([recurrenceId]) => timeProp("EXDATE", recurrenceId, event))
      : []),
  ];
  const plain = { ...event, recurrenceRule: null, recurrenceOverrides: null };
  const dates = changed.map(([recurrenceId, patch]) => {
    const date = applyPatch({ ...plain, start: recurrenceId }, patch);
    return [
      ...head(date),
      timeProp("RECURRENCE-ID", recurrenceId, event),
      ...eventProps(date, concerned),
    ];
  });
  const zones =
    event.timeZone && !event.showWithoutTime && !isUtc(event.timeZone)
      ? vtimezone(event.timeZone, Number(event.start.slice(0, 4)))
      : [];
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Kontext//Kalender//DE",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...zones,
    ...component(series),
    ...dates.flatMap(component),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
};
