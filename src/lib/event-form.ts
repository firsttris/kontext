/** The event editor's form and the JSCalendar properties it becomes (RFC 8984). */
import {
  attendees,
  type CalendarEvent,
  eventTimes,
  fromLocal,
  locationName,
  participantEmail,
  toDuration,
  toLocal,
  ZONE,
} from "./jscalendar";
import { fromRecurrenceRule, NO_REPEAT, type RepeatForm, toRecurrenceRule } from "./recurrence";

export type EventForm = {
  title: string;
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  attendees: string;
  description: string;
  /** How the event repeats; null for a rule the form cannot show, which is kept as it is. */
  recurrence: RepeatForm | null;
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
    attendees: attendees(event)
      .map(([, p]) => participantEmail(p))
      .filter((email) => email && !mine.has(email.toLowerCase()))
      .join(", "),
    description: event.description ?? "",
    recurrence: fromRecurrenceRule((series ?? event).recurrenceRule),
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
    attendees: "",
    description: "",
    recurrence: NO_REPEAT,
  };
};

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
    : Math.max(
        0,
        Math.round(
          (fromLocal(`${form.endDate}T${form.endTime}:00`).getTime() -
            fromLocal(startLocal).getTime()) /
            60_000,
        ),
      );
  const emails = form.attendees
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
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
    participants,
    organizerCalendarAddress: participants ? `mailto:${organizer.email}` : null,
    ...(withRecurrence && form.recurrence
      ? { recurrenceRule: toRecurrenceRule(form.recurrence) }
      : {}),
  };
};

/** Adds minutes to a local date-time as on a wall clock ("…T09:00:00" + 30 → "…T09:30:00"). */
export const shiftLocal = (local: string, minutes: number): string =>
  new Date(Date.parse(`${local}Z`) + minutes * 60_000).toISOString().slice(0, 19);

/** Minutes between two local date-times, on the wall clock. */
export const localDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60_000);

/**
 * Where the series starts after one of its instances was moved from `before` to `after` (local
 * date-times): by the same amount, so changing 9:00 to 10:00 on any Monday moves all Mondays.
 */
export const seriesStart = (seriesStartLocal: string, before: string, after: string): string =>
  shiftLocal(seriesStartLocal, localDiff(before, after));

/**
 * The patch that moves a timed event to a new start (and optionally a new length), kept in the
 * event's own time zone. Dragging in the grid uses it.
 */
export const movePatch = (
  event: CalendarEvent,
  start: Date,
  minutes?: number,
): Record<string, unknown> => ({
  start: toLocal(start, event.timeZone ?? ZONE),
  ...(minutes !== undefined ? { duration: toDuration(Math.max(15, minutes)) } : {}),
});
