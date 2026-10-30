/**
 * The dates of a repeating event (RFC 8984 §4.3.3), as far as people make them in the app: daily,
 * weekly (also on chosen weekdays), monthly and yearly, every n-th, up to a count or a date.
 * Local date-times in, local date-times out ("2026-11-02T07:30:00"); pure.
 */
import { addDays, weekStart } from "@/lib/jscalendar";
import type { RecurrenceRule } from "@/lib/recurrence";

/** How many periods are looked at: a daily series without end stops after about ten years. */
const MAX_PERIODS = 3660;

const DAY_CODES = ["mo", "tu", "we", "th", "fr", "sa", "su"];

/** The same day of the month `months` away; none when that month is shorter (RFC 8984 skip). */
const sameDayInMonth = (key: string, months: number): string[] => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1 + months, d!));
  return date.getUTCDate() === d ? [date.toISOString().slice(0, 10)] : [];
};

/** The dates of the n-th period after the first date, in order. */
const periodDates = (first: string, rule: RecurrenceRule, n: number): string[] => {
  switch (rule.frequency) {
    case "daily":
      return [addDays(first, n)];
    case "weekly": {
      if (!rule.byDay?.length) return [addDays(first, 7 * n)];
      const monday = addDays(weekStart(first), 7 * n);
      const days = rule.byDay.map((day) => DAY_CODES.indexOf(day.day)).filter((i) => i >= 0);
      return [...new Set(days)].sort((a, b) => a - b).map((i) => addDays(monday, i));
    }
    case "monthly":
      return sameDayInMonth(first, n);
    case "yearly":
      return sameDayInMonth(first, 12 * n);
    default:
      return n === 0 ? [first] : [];
  }
};

/** The start of every date of the series up to `last` (inclusive), the first one included. */
export const occurrences = (start: string, rule: RecurrenceRule, last: string): string[] => {
  const first = start.slice(0, 10);
  const time = start.slice(10);
  const interval = Math.max(1, rule.interval ?? 1);
  const count = rule.count ?? Number.POSITIVE_INFINITY;
  const found: string[] = [];
  for (let period = 0; period < MAX_PERIODS; period++) {
    for (const key of periodDates(first, rule, period * interval)) {
      const local = `${key}${time}`;
      if (local < start) continue;
      if (local > last || (rule.until && local > rule.until)) return found;
      found.push(local);
      if (found.length >= count) return found;
    }
  }
  return found;
};
