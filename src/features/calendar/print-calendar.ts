/**
 * Prints the calendar as it is open: the month in the month view, the week in the day and week
 * views, the next seven days from the list's first, with the events of the calendars shown. The
 * sheet comes from lib/calendar-print*.ts, the print dialog from a hidden frame (print-frame.ts),
 * so the app around it stays off the paper.
 */
import { printPage } from "@/components/print-frame";
import { printMonth, printWeek } from "@/lib/calendar-print";
import { calendarPrintDocument } from "@/lib/calendar-print-document";
import { weekdayHeads } from "@/lib/format";
import { type CalendarEvent, isoWeek } from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { monthDays } from "./month-view";
import type { CalendarRef } from "./queries";

const noon = (day: string) => new Date(`${day}T12:00:00Z`);

const rangeTitle = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthTitle = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayHead = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  timeZone: "UTC",
});
const printedAt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

const calendarName = (calendar: CalendarRef) =>
  calendar.isPersonal || calendar.name === calendar.owner
    ? calendar.name
    : `${calendar.owner} · ${calendar.name}`;

/** "44", or "44–45" for seven days from the middle of a week (printed from the list). */
const weekNumbers = (days: string[]) => {
  const first = isoWeek(days[0]!);
  const last = isoWeek(days.at(-1)!);
  return first === last ? String(first) : `${first}–${last}`;
};

type What = {
  /** The month's sheet, or the week's for `days`. */
  kind: "week" | "month";
  /** The seven days to print; for a month any day in it. */
  days: string[];
  events: CalendarEvent[];
  calendars: CalendarRef[];
};

/** The sheet's content: titles in the user's language, the days with their events. */
export const calendarSheet = ({ kind, days, events, calendars }: What, now = new Date()) => {
  const shown = calendars
    .filter((calendar) => calendar.visible)
    .map((calendar) => ({ name: calendarName(calendar), color: calendar.color }));
  const printed = m.calendar_print_printed({ date: printedAt.format(now) });
  if (kind === "month") {
    const month = days[0]!.slice(0, 7);
    return {
      kind,
      title: monthTitle.format(noon(`${month}-15`)),
      subtitle: "",
      heads: weekdayHeads(LOCALE),
      weeks: printMonth(monthDays(days[0]!), month, events),
      calendars: shown,
      printed,
    };
  }
  return {
    kind,
    title: rangeTitle.formatRange(noon(days[0]!), noon(days.at(-1)!)),
    subtitle: m.calendar_week_number({ week: weekNumbers(days) }),
    heads: days.map((day) => dayHead.format(noon(day))),
    weeks: [printWeek(days, events)],
    calendars: shown,
    printed,
  };
};

export const printCalendar = (what: What) => printPage(calendarPrintDocument(calendarSheet(what)));
