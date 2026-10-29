/**
 * What goes on the printed calendar: per day its events as lines (all-day ones first, then by
 * time), for a week or a month on A4. Only the layout as data; the page is built in
 * calendar-print-document.ts. Pure.
 */
import {
  addDays,
  type CalendarEvent,
  eventTimes,
  fromLocal,
  locationName,
  minutesInDay,
  onDay,
  timeLabel,
} from "./jscalendar";

export type PrintEntry = {
  title: string;
  /** "08:00–09:30"; "22:00–" or "–10:00" when it began before or ends after the day; "" all day. */
  time: string;
  place: string;
  /** The calendar's colour, only as a hex code or a colour name: it goes into the page's CSS. */
  color: string;
  allDay: boolean;
};

export type PrintDay = {
  day: string;
  /** False for the days of the months before and after on the month's sheet. */
  inMonth: boolean;
  entries: PrintEntry[];
  /** Events that did not fit ("+2 weitere"). */
  more: number;
};

const FALLBACK_COLOR = "#71717a";
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

/** A calendar's colour comes from the server: anything but a plain colour could break out of CSS. */
export const safeColor = (color: string | undefined): string =>
  color && SAFE_COLOR.test(color) ? color : FALLBACK_COLOR;

/** From–to on the day; open on the side where the event goes on beyond the day. */
const timeOnDay = (start: Date, end: Date, day: string): string | null => {
  const dayStart = fromLocal(`${day}T00:00:00`);
  const dayEnd = fromLocal(`${addDays(day, 1)}T00:00:00`);
  // A day the event fills from midnight to midnight while going on beyond it (the middle of a
  // longer event, or its first or last day when it starts or ends at midnight) is spent on it as
  // a whole.
  if (start <= dayStart && end >= dayEnd && (start < dayStart || end > dayEnd)) return null;
  const from = start >= dayStart ? timeLabel(minutesInDay(start, day)) : "";
  const to = end <= dayEnd ? timeLabel(end >= dayEnd ? 1440 : minutesInDay(end, day)) : "";
  return from === to ? from : `${from}–${to}`;
};

const entryOn = (event: CalendarEvent, day: string): PrintEntry & { start: number } => {
  const { start, end, allDay } = eventTimes(event);
  const time = allDay ? null : timeOnDay(start, end, day);
  return {
    title: event.title?.trim() || "—",
    time: time ?? "",
    place: locationName(event),
    color: safeColor(event.color),
    allDay: time === null,
    start: start.getTime(),
  };
};

/** The day's events: all-day ones first, then by start, then by title. */
export const entriesOn = (events: CalendarEvent[], day: string): PrintEntry[] =>
  events
    .filter((event) => onDay(event, day))
    .map((event) => entryOn(event, day))
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title),
    )
    .map(({ start: _start, ...entry }) => entry);

/** The week's days, each with all its events: a column has room for them on landscape A4. */
export const printWeek = (days: string[], events: CalendarEvent[]): PrintDay[] =>
  days.map((day) => ({ day, inMonth: true, entries: entriesOn(events, day), more: 0 }));

/** Lines a day of the month has room for, by the number of weeks on the sheet (4 to 6). */
export const monthLines = (weeks: number): number => Math.floor(26 / weeks);

/** Cuts a day to `lines` lines; the last one says how many more there are. */
const cutToLines = (day: PrintDay, lines: number): PrintDay =>
  day.entries.length <= lines
    ? day
    : { ...day, entries: day.entries.slice(0, lines - 1), more: day.entries.length - lines + 1 };

/**
 * The month's sheet: the weeks of the grid (`days`, Monday before the 1st onwards) that hold a
 * day of the month, without the empty sixth week, each day cut to the lines it has room for.
 */
export const printMonth = (
  days: string[],
  month: string,
  events: CalendarEvent[],
): PrintDay[][] => {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  ).filter((week) => week.some((day) => day.startsWith(month)));
  const lines = monthLines(weeks.length);
  return weeks.map((week) =>
    week.map((day) =>
      cutToLines(
        { day, inMonth: day.startsWith(month), entries: entriesOn(events, day), more: 0 },
        lines,
      ),
    ),
  );
};
