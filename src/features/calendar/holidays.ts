/**
 * "Feiertage eintragen": the public holidays of a state as all-day events in a calendar of their
 * own, this year and next. Shown as free, so they don't block anyone's availability. Pure.
 */
import { type Holiday, holidays, STATES, type State } from "@/lib/holidays";
import type { CalendarEvent } from "@/lib/jscalendar";

/** The calendar's name, by which a second run finds it again. */
export const holidayCalendarName = (state: State): string => `Feiertage ${STATES[state]}`;

/** The years filled: the current one and the next. */
export const holidayYears = (today: string): [number, number] => {
  const year = Number(today.slice(0, 4));
  return [year, year + 1];
};

export const holidayEvent = (holiday: Holiday): Record<string, unknown> => ({
  title: holiday.name,
  start: `${holiday.day}T00:00:00`,
  timeZone: null,
  showWithoutTime: true,
  duration: "P1D",
  freeBusyStatus: "free",
});

/** The holidays of the years that are not in the calendar yet (same day and name). */
export const missingHolidays = (
  state: State,
  years: number[],
  existing: Pick<CalendarEvent, "start" | "title">[],
): Holiday[] => {
  const present = new Set(existing.map((event) => `${event.start.slice(0, 10)} ${event.title}`));
  return years
    .flatMap((year) => holidays(year, state))
    .filter((holiday) => !present.has(`${holiday.day} ${holiday.name}`));
};
