/**
 * "Duplizieren": an appointment as the form of a new one. The copy is a new event (the create
 * path gives it a new uid, src/jmap/calendar.ts), so it keeps nothing that ties it to the
 * original: no recurrence overrides, no answers of the attendees, no series.
 */

import { type EventForm, eventToForm, formToEvent } from "./event-form";
import type { CalendarEvent } from "./jscalendar";
import { NO_REPEAT } from "./recurrence";
import type { Alert } from "./reminders";

/**
 * The form for a copy of `event`: everything the form holds, on the original's date. A date of a
 * series is copied as that date alone, without the series' rule: the user wants one more
 * appointment like this one, and may pick a repetition in the form.
 */
export const copyForm = (event: CalendarEvent, myAddresses: string[]): EventForm => ({
  ...eventToForm(event, myAddresses),
  recurrence: NO_REPEAT,
});

/**
 * The JSCalendar properties of the copy. Alerts the form cannot show ("kept") come along as they
 * are, not yet acknowledged; formToEvent would leave a new event without them.
 */
export const copyToEvent = (
  form: EventForm,
  organizer: { email: string; name?: string },
  original: CalendarEvent,
): Record<string, unknown> => {
  const data = formToEvent(form, organizer);
  if (form.reminder !== "kept" || !original.alerts) return data;
  return { ...data, alerts: freshAlerts(original.alerts) };
};

const freshAlerts = (alerts: Record<string, Alert>): Record<string, Alert> =>
  Object.fromEntries(
    Object.entries(alerts).map(([key, alert]) => {
      const { acknowledged: _acknowledged, ...rest } = alert as Alert & { acknowledged?: string };
      return [key, rest];
    }),
  );
