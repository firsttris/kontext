/**
 * The app's own rows in the calendar list that are no calendars (birthdays, tasks): shown or
 * hidden per device in the browser. Real calendars keep this on the server (`isVisible`,
 * queries.ts); what a device hid of them before Stalwart 1.0 is still read once and moved there.
 */
import { storedSet } from "@/components/stored-set";

const hidden = storedSet("kontext.hiddenCalendars");

export const setCalendarHidden = (key: string, hide: boolean): void => hidden.set(key, hide);

/** Drops a key once its calendar's choice is on the server. */
export const forgetHiddenCalendar = (key: string): void => hidden.set(key, false);

/** The hidden keys: "birthdays", "tasks", and calendars (`accountId:calendarId`) not moved yet. */
export const useHiddenCalendars = (): ReadonlySet<string> => hidden.useSet();
