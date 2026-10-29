/**
 * "Dieser und alle folgenden": a series split at one of its dates, as Google, Outlook and Apple
 * do it. The series so far ends just before that date (`until`, RFC 8984 §4.3.3); from there a
 * new series starts with what the form says. Changed dates before the split stay with the old
 * series. Pure.
 */
import { type CalendarEvent, shiftLocal } from "./jscalendar";
import type { RecurrenceRule } from "./recurrence";

/** Whether the date is the series' first: then "and all following" is the whole series. */
export const isFirstDate = (series: Pick<CalendarEvent, "start">, recurrenceId: string): boolean =>
  recurrenceId.slice(0, 19) <= series.start.slice(0, 19);

/** The rule of the series so far: it ends the minute before the date (`until` counts in). */
export const endBefore = (rule: RecurrenceRule, recurrenceId: string): RecurrenceRule => {
  const { count: _count, until: _until, ...rest } = rule;
  return { ...rest, until: shiftLocal(recurrenceId.slice(0, 19), -1) };
};

/** The changed and left-out dates of the series so far; those from the split on go. */
export const overridesBefore = (
  overrides: CalendarEvent["recurrenceOverrides"],
  recurrenceId: string,
): CalendarEvent["recurrenceOverrides"] => {
  const kept = Object.entries(overrides ?? {}).filter(([date]) => date < recurrenceId);
  return kept.length ? Object.fromEntries(kept) : null;
};

/**
 * The rule of the new series. A series of so many dates keeps its number in all: the new one
 * gets what is left after the `before` dates the old one keeps.
 */
export const followingRule = (
  rule: RecurrenceRule | null | undefined,
  before: number,
): RecurrenceRule | null => {
  if (!rule) return null;
  return rule.count ? { ...rule, count: Math.max(1, rule.count - before) } : rule;
};

/** The patch that ends the series before the date. */
export const endSeriesPatch = (
  series: Pick<CalendarEvent, "recurrenceRule" | "recurrenceOverrides">,
  recurrenceId: string,
): Record<string, unknown> => ({
  recurrenceRule: series.recurrenceRule ? endBefore(series.recurrenceRule, recurrenceId) : null,
  recurrenceOverrides: overridesBefore(series.recurrenceOverrides, recurrenceId),
});
