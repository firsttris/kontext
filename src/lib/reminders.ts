/**
 * The reminder of an appointment, kept as a JSCalendar alert (RFC 8984 §4.5.2): an offset before
 * the start, shown on the devices ("display") or sent as a mail ("email"). Stalwart acts on them
 * itself, also with Kontext closed: it sends the mail, and for a notice it puts a `calendarAlert`
 * into the JMAP event stream (crates/services/src/task_manager/alarm.rs), which the Kontext
 * server turns into a push (server/push/mail-watch.ts). Stalwart only looks at the first alert of
 * an event (`next_alarm` in crates/groupware/src/calendar/alarm.rs), so an event has one.
 */
import { durationMinutes, toDuration } from "./jscalendar";

export type ReminderAction = "display" | "email";

/** `minutes` before the start; negative for after it (all day: "on the day at 9:00"). */
export type Reminder = { minutes: number; action: ReminderAction };

/** The form's choice: a reminder, none, or alerts it cannot show and keeps as they are. */
export type ReminderChoice = Reminder | null | "kept";

export type Alert = {
  "@type"?: "Alert";
  trigger?: { "@type"?: string; offset?: string; relativeTo?: "start" | "end" };
  action?: string;
};

/** Before the start of an appointment with a time. */
export const TIMED_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
/**
 * Before the start (midnight) of an all-day appointment: in the morning (9:00) of the day or of
 * days before. Stalwart reads an all-day event's floating time as UTC, so its mail comes at 10:00
 * or 11:00 in Germany (`next_alarm(now, Tz::Floating)` in crates/jmap/src/calendar_event/set.rs).
 */
export const ALL_DAY_MINUTES = [-540, 900, 2340, 9540];

/** What a new appointment gets: as before, a notice 15 minutes ahead; all day none. */
export const defaultReminder = (allDay: boolean): Reminder | null =>
  allDay ? null : { minutes: 15, action: "display" };

const DURATION = /^([+-])?(P(?:\d+W)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/;

/** "-PT15M" → 15 minutes before; "PT9H" → 540 minutes after (RFC 8984 SignedDuration). */
const minutesBefore = (offset: string): number | undefined => {
  const match = offset.match(DURATION);
  if (!match || match[2] === "P") return undefined;
  const minutes = durationMinutes(match[2]);
  return match[1] === "-" ? minutes : -minutes || 0;
};

const signedOffset = (minutes: number): string =>
  minutes > 0 ? `-${toDuration(minutes)}` : toDuration(-minutes);

/** The reminder the form shows for an event's alerts. */
export const reminderOf = (alerts: Record<string, Alert> | null | undefined): ReminderChoice => {
  const all = Object.values(alerts ?? {});
  const first = all[0];
  if (!first) return null;
  const trigger = first.trigger;
  const offset =
    trigger?.["@type"] === "OffsetTrigger" && (trigger.relativeTo ?? "start") === "start"
      ? minutesBefore(trigger.offset ?? "")
      : undefined;
  if (offset === undefined || all.length > 1) return "kept";
  return { minutes: offset, action: first.action === "email" ? "email" : "display" };
};

/**
 * The alerts for the form's choice; undefined for "kept", so the event's own stay untouched. The
 * key of the first alert stays, so CalDAV clients see the same alarm changed, not a new one.
 */
export const alertsOf = (
  choice: ReminderChoice,
  existing?: Record<string, Alert> | null,
): Record<string, Alert> | null | undefined => {
  if (choice === "kept") return undefined;
  if (!choice) return null;
  const key = Object.keys(existing ?? {})[0] ?? "reminder";
  return {
    [key]: {
      "@type": "Alert",
      trigger: {
        "@type": "OffsetTrigger",
        offset: signedOffset(choice.minutes),
        relativeTo: "start",
      },
      action: choice.action,
    },
  };
};

/** The choice when the appointment becomes all-day or gets a time: there is still a reminder. */
export const reminderForKind = (choice: ReminderChoice, allDay: boolean): ReminderChoice => {
  if (!choice || choice === "kept") return choice;
  const choices = allDay ? ALL_DAY_MINUTES : TIMED_MINUTES;
  if (choices.includes(choice.minutes)) return choice;
  return { ...choice, minutes: allDay ? 900 : 15 };
};

/** The minutes the form offers, with the event's own when it is none of them. */
export const reminderMinutes = (choice: ReminderChoice, allDay: boolean): number[] => {
  const choices = allDay ? ALL_DAY_MINUTES : TIMED_MINUTES;
  return choice && choice !== "kept" && !choices.includes(choice.minutes)
    ? [...choices, choice.minutes].sort((a, b) => a - b)
    : choices;
};

/** When a notice is due: the start minus the reminder. */
export const reminderMoment = (start: Date, reminder: Reminder): Date =>
  new Date(start.getTime() - reminder.minutes * 60_000);

/**
 * Milliseconds until an appointment's notice is due, if it is one shown on the devices and due
 * within a day; none if that moment has passed or the event reminds by mail.
 */
export const noticeDelay = (
  start: Date,
  alerts: Record<string, Alert> | null | undefined,
  now: Date,
): number | undefined => {
  const reminder = reminderOf(alerts);
  if (!reminder || reminder === "kept" || reminder.action !== "display") return undefined;
  const delay = reminderMoment(start, reminder).getTime() - now.getTime();
  return delay >= 0 && delay <= 86_400_000 ? delay : undefined;
};

/**
 * The tag of a reminder's notification. The app and the server's push use the same one, so a
 * reminder shows once when both tell of it.
 */
export const reminderTag = (
  accountId: string,
  eventId: string,
  recurrenceId?: string | null,
): string => `reminder-${accountId}/${eventId}${recurrenceId ? `/${recurrenceId}` : ""}`;

/** "Do., 29.10., 14:00" or, all day, "Do., 29.10." in the given language. */
export const reminderWhen = (start: Date, allDay: boolean, locale: string, zone: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(start);
