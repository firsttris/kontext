/**
 * Reminders of appointments as pushes, also with Kontext closed: Stalwart puts a `calendarAlert`
 * into the JMAP event stream when a reminder by notice is due (crates/jmap/src/api/event_source.rs,
 * crates/services/src/task_manager/alarm.rs); the server fetches the event and tells the person's
 * devices. Reminders by mail Stalwart sends itself.
 */

import { applyPatch } from "../../src/lib/itip";
import {
  type CalendarEvent,
  dateKey,
  fromLocal,
  locationName,
  ZONE,
} from "../../src/lib/jscalendar";
import { reminderTag, reminderWhen } from "../../src/lib/reminders";
import type { Notice } from "./pusher";

/** What the event stream says (draft-ietf-jmap-calendars, CalendarAlert push object). */
export type CalendarAlertPush = {
  accountId: string;
  calendarEventId: string;
  recurrenceId: string | null;
  alertId: string;
};

export const EVENT_PROPERTIES = [
  "title",
  "start",
  "timeZone",
  "showWithoutTime",
  "locations",
  "recurrenceOverrides",
];

type RemindedEvent = Pick<
  CalendarEvent,
  "title" | "start" | "timeZone" | "showWithoutTime" | "locations" | "recurrenceOverrides"
>;

/**
 * The date the alert is for, with its own changes, and its recurrence id. Stalwart names a date
 * changed on its own (it has its own alerts) by its own start, not by its recurrence id
 * (`recurrence_id: start_date_naive` in crates/groupware/src/calendar/alarm.rs).
 */
const remindedDate = (
  event: RemindedEvent,
  start: string,
): { date: RemindedEvent; recurrenceId: string } => {
  const [recurrenceId, patch] = Object.entries(event.recurrenceOverrides ?? {}).find(
    ([id, patch]) => (patch.start ?? id) === start,
  ) ?? [start, {}];
  return { date: applyPatch({ ...event, start }, patch), recurrenceId };
};

/** The notification for a due reminder; the same tag as the open app's (announcements.ts). */
export const reminderNotice = (alert: CalendarAlertPush, series: RemindedEvent): Notice => {
  // The date of a series is named by its start, a local time in the event's zone.
  const { date: event, recurrenceId } = alert.recurrenceId
    ? remindedDate(series, alert.recurrenceId)
    : { date: series, recurrenceId: null };
  const allDay = Boolean(event.showWithoutTime);
  const local = event.start;
  const start = allDay
    ? fromLocal(`${local.slice(0, 10)}T00:00:00`)
    : fromLocal(local, event.timeZone);
  const place = locationName(event);
  const search = new URLSearchParams({
    date: dateKey(start),
    event: alert.calendarEventId,
    account: alert.accountId,
  });
  return {
    title: `Erinnerung: ${event.title || "Termin"}`,
    body: `${reminderWhen(start, allDay, "de-DE", ZONE)}${place ? ` · ${place}` : ""}`,
    url: `/calendar?${search}`,
    tag: reminderTag(alert.accountId, alert.calendarEventId, recurrenceId),
  };
};
