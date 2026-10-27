/**
 * Which calendars the user has hidden, per device in the browser. Stalwart 0.16.27 only lets a
 * user change the per-user `isVisible` of a colleague's calendar with write access, so the app
 * keeps this choice itself, the same way for every calendar.
 */
import { storedSet } from "@/components/stored-set";

const hidden = storedSet("kontext.hiddenCalendars");

export const setCalendarHidden = (key: string, hide: boolean): void => hidden.set(key, hide);

/** The keys (`accountId:calendarId`) of the hidden calendars. */
export const useHiddenCalendars = (): ReadonlySet<string> => hidden.useSet();
