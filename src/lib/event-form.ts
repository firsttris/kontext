/** The event editor's form and the JSCalendar properties it becomes (RFC 8984). */

import type { EmailAddress } from "@/jmap/types";
import { parseAddresses } from "./addresses";
import { documentsOfLinks, type LinkedDocument, withDocuments } from "./document-links";
import {
  attendees,
  type CalendarEvent,
  eventTimes,
  fromLocal,
  isMeetingLink,
  localDiff,
  locationName,
  meetingLink,
  participantEmail,
  shiftLocal,
  toDuration,
  toLocal,
  ZONE,
} from "./jscalendar";
import { fromRecurrenceRule, NO_REPEAT, type RepeatForm, toRecurrenceRule } from "./recurrence";
import { alertsOf, defaultReminder, type ReminderChoice, reminderOf } from "./reminders";

export type EventForm = {
  title: string;
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  /** The link of the event's Kontext video meeting, or "". */
  meeting: string;
  attendees: string;
  /** Whether the time counts as busy for colleagues planning a meeting (RFC 8984 freeBusyStatus). */
  showAs: "busy" | "free";
  description: string;
  /** How the event repeats; null for a rule the form cannot show, which is kept as it is. */
  recurrence: RepeatForm | null;
  /** When and how it reminds; "kept" for alerts the form cannot show, which stay as they are. */
  reminder: ReminderChoice;
  /** Files of Dokumente that belong to it, kept as its links. */
  documents: LinkedDocument[];
};

/** `series` is the base event of an instance; its rule is what the form shows. */
export const eventToForm = (
  event: CalendarEvent,
  myAddresses: string[],
  series?: CalendarEvent,
): EventForm => {
  const { start, end, allDay } = eventTimes(event);
  const startLocal = toLocal(start);
  const endLocal = toLocal(allDay ? new Date(end.getTime() - 1) : end);
  const mine = new Set(myAddresses.map((a) => a.toLowerCase()));
  return {
    title: event.title ?? "",
    date: startLocal.slice(0, 10),
    startTime: startLocal.slice(11, 16),
    endDate: endLocal.slice(0, 10),
    endTime: endLocal.slice(11, 16),
    allDay,
    location: locationName(event),
    meeting: meetingLink(event),
    attendees: attendees(event)
      .map(([, p]) => participantEmail(p))
      .filter((email) => email && !mine.has(email.toLowerCase()))
      .join(", "),
    showAs: event.freeBusyStatus === "free" ? "free" : "busy",
    description: event.description ?? "",
    recurrence: fromRecurrenceRule((series ?? event).recurrenceRule),
    reminder: reminderOf(event.alerts),
    documents: documentsOfLinks(event.links),
  };
};

export const newEventForm = (startLocal: string, minutes = 60): EventForm => {
  const start = fromLocal(startLocal);
  const end = toLocal(new Date(start.getTime() + minutes * 60_000));
  return {
    title: "",
    date: startLocal.slice(0, 10),
    startTime: startLocal.slice(11, 16),
    endDate: end.slice(0, 10),
    endTime: end.slice(11, 16),
    allDay: false,
    location: "",
    meeting: "",
    attendees: "",
    showAs: "busy",
    description: "",
    recurrence: NO_REPEAT,
    reminder: defaultReminder(false),
    documents: [],
  };
};

/** The form's start as a local date-time ("2026-10-31T17:30"). */
export const startOfForm = (form: EventForm): string => `${form.date}T${form.startTime}`;

/** Whether a local date-time is whole, not missing a date or time still being typed. */
export const isComplete = (local: string): boolean => !Number.isNaN(Date.parse(`${local}Z`));

/**
 * The form with a new start date or time; the end moves along so the length stays, as in Google
 * and Apple Calendar. An end that was not after the start gives the new start an hour. A date or
 * time field reports "" while a part of it is being retyped: then only the field changes, and the
 * next complete start measures the length from `lastStart`, the start before it was cleared.
 */
export const withStart = (
  form: EventForm,
  change: Partial<Pick<EventForm, "date" | "startTime">>,
  lastStart = startOfForm(form),
): EventForm => {
  const next = { ...form, ...change };
  const before = isComplete(startOfForm(form)) ? startOfForm(form) : lastStart;
  const after = startOfForm(next);
  const end = `${form.endDate}T${form.endTime}`;
  if (![before, after, end].every(isComplete)) return next;
  const length = localDiff(before, end);
  const moved = shiftLocal(after, length > 0 ? length : 60);
  return { ...next, endDate: moved.slice(0, 10), endTime: moved.slice(11, 16) };
};

/** The addresses in the attendee field ("Anna Weber <a@x.de>, b@x.de"). */
export const attendeeAddresses = (text: string): EmailAddress[] => parseAddresses(text).addresses;

export const attendeeEmails = (text: string): string[] =>
  attendeeAddresses(text).map((address) => address.email);

export type FormProblem = "title" | "order" | "repeatEnd" | null;

export const validateEventForm = (form: EventForm): FormProblem => {
  if (!form.title.trim()) return "title";
  const start = form.allDay ? form.date : `${form.date}T${form.startTime}`;
  const end = form.allDay ? form.endDate : `${form.endDate}T${form.endTime}`;
  if (end < start) return "order";
  const repeat = form.recurrence;
  if (repeat && repeat.repeat !== "none" && repeat.repeatEnd === "until")
    return repeat.repeatUntil && repeat.repeatUntil >= form.date ? null : "repeatEnd";
  return null;
};

/**
 * The JSCalendar properties for a form. Attendees get a participant each; the organizer is the
 * user, so the server sends the invitations (iMIP).
 */
export const formToEvent = (
  form: EventForm,
  organizer: { email: string; name?: string },
  existing?: CalendarEvent,
  /** False when only one instance of a series changes: its rule stays with the series. */
  withRecurrence = true,
): Record<string, unknown> => {
  const startLocal = form.allDay ? `${form.date}T00:00:00` : `${form.date}T${form.startTime}:00`;
  const minutes = form.allDay
    ? Math.max(1, Math.round((Date.parse(form.endDate) - Date.parse(form.date)) / 86_400_000) + 1) *
      1440
    : // On the wall clock, the way Stalwart reads it back (see localEnd in jscalendar.ts).
      Math.max(0, localDiff(startLocal, `${form.endDate}T${form.endTime}:00`));
  const emails = attendeeEmails(form.attendees);
  const previous = new Map(
    attendees(existing ?? ({} as CalendarEvent)).map(([id, p]) => [
      participantEmail(p).toLowerCase(),
      [id, p] as const,
    ]),
  );
  const participants = emails.length
    ? Object.fromEntries([
        [
          previous.get(organizer.email.toLowerCase())?.[0] ?? "organizer",
          {
            "@type": "Participant",
            name: organizer.name,
            calendarAddress: `mailto:${organizer.email}`,
            roles: { owner: true, attendee: true },
            participationStatus: "accepted",
          },
        ],
        ...emails.map((email, index) => {
          const known = previous.get(email.toLowerCase());
          return [
            known?.[0] ?? `a${index}`,
            {
              "@type": "Participant",
              calendarAddress: `mailto:${email}`,
              roles: { attendee: true },
              participationStatus: known?.[1].participationStatus ?? "needs-action",
              expectReply: true,
              ...(known?.[1].name ? { name: known[1].name } : {}),
            },
          ];
        }),
      ])
    : null;
  const alerts = alertsOf(form.reminder, existing?.alerts);
  return {
    title: form.title.trim(),
    start: startLocal,
    timeZone: form.allDay ? null : ZONE,
    showWithoutTime: form.allDay,
    duration: toDuration(minutes),
    description: form.description.trim() || null,
    locations: form.location.trim()
      ? {
          [Object.keys(existing?.locations ?? {})[0] ?? "l"]: {
            "@type": "Location",
            name: form.location.trim(),
          },
        }
      : null,
    virtualLocations: withMeeting(existing?.virtualLocations, form.meeting),
    participants,
    links: withDocuments(existing?.links, form.documents),
    organizerCalendarAddress: participants ? `mailto:${organizer.email}` : null,
    freeBusyStatus: form.showAs,
    ...(alerts !== undefined ? { alerts } : {}),
    ...(withRecurrence && form.recurrence
      ? { recurrenceRule: toRecurrenceRule(form.recurrence) }
      : {}),
  };
};

/**
 * The event's online places with the Kontext meeting as the form has it; other places (a Teams
 * link from an imported invitation) stay.
 */
const withMeeting = (
  existing: CalendarEvent["virtualLocations"],
  meeting: string,
): Record<string, unknown> | null => {
  const others = Object.entries(existing ?? {}).filter(
    ([, place]) => !isMeetingLink(place.uri ?? ""),
  );
  const places = Object.fromEntries([
    ...others,
    ...(meeting
      ? [
          [
            "kontext-meeting",
            {
              "@type": "VirtualLocation",
              name: "Videobesprechung",
              uri: meeting,
              features: { audio: true, video: true, screen: true },
            },
          ],
        ]
      : []),
  ]);
  return Object.keys(places).length ? places : null;
};

/**
 * The meeting's line in the notes, so guests in Outlook or Gmail find the link too (they do not
 * all show iCalendar's CONFERENCE).
 */
export const meetingNote = (url: string) => `Videobesprechung: ${url}`;

export const addMeetingNote = (description: string, url: string): string =>
  description.includes(url)
    ? description
    : [description.trimEnd(), meetingNote(url)].filter(Boolean).join("\n\n");

export const removeMeetingNote = (description: string, url: string): string =>
  description
    .split("\n")
    .filter((line) => !line.includes(url))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Where the series starts after one of its instances was moved from `before` to `after` (local
 * date-times): by the same amount, so changing 9:00 to 10:00 on any Monday moves all Mondays.
 */
export const seriesStart = (seriesStartLocal: string, before: string, after: string): string =>
  shiftLocal(seriesStartLocal, localDiff(before, after));

/**
 * The patch that moves a timed event to a new start (and, when resized, a new end), kept in the
 * event's own time zone. Dragging in the grid uses it.
 */
export const movePatch = (
  event: CalendarEvent,
  start: Date,
  end?: Date,
): Record<string, unknown> => {
  const zone = event.timeZone ?? ZONE;
  const startLocal = toLocal(start, zone);
  // The length on the wall clock, the way Stalwart reads it back (see localEnd in jscalendar.ts).
  const minutes = end && Math.max(15, localDiff(startLocal, toLocal(end, zone)));
  return { start: startLocal, ...(minutes ? { duration: toDuration(minutes) } : {}) };
};
