/**
 * "Dieser und alle folgenden": the series so far ends before the date, and a new series starts
 * there with the form's data (src/lib/series-split.ts). Both go through saveEvent, so attendees
 * hear of it: the old series as changed, the new one as an invitation, as Outlook does it.
 */
import { useClient } from "@/auth/auth";
import { queryEvents } from "@/jmap/calendar";
import { type CalendarEvent, fromLocal } from "@/lib/jscalendar";
import type { RecurrenceRule } from "@/lib/recurrence";
import { endSeriesPatch, followingRule } from "@/lib/series-split";
import { type CalendarRef, calendarOf, useCalendarRefs, useEventMutations } from "./queries";

export const useSplitSeries = () => {
  const client = useClient();
  const { create, update } = useEventMutations();
  const { calendars } = useCalendarRefs();

  /** How many dates of the series come before the split; they stay with the old series. */
  const datesBefore = async (series: CalendarEvent, recurrenceId: string) => {
    const zone = series.timeZone;
    const events = await queryEvents(
      client,
      series.accountId!,
      fromLocal(series.start.slice(0, 19), zone),
      fromLocal(recurrenceId.slice(0, 19), zone),
    );
    const split = recurrenceId.slice(0, 19);
    // `count` counts the dates of the rule; left-out ones and those moved past the split are not
    // in the query but count too (RFC 8984 §4.3.3, RFC 5545 §3.8.5.3; so does Stalwart 0.16.27).
    const dates = new Set([
      ...events
        .filter((event) => event.baseEventId === series.id)
        .map((event) => (event.recurrenceId ?? "").slice(0, 19)),
      ...Object.keys(series.recurrenceOverrides ?? {}).map((date) => date.slice(0, 19)),
    ]);
    return [...dates].filter((date) => date && date < split).length;
  };

  /** Ends the series before the instance's date. */
  const endBeforeDate = (instance: CalendarEvent, series: CalendarEvent) =>
    update.mutateAsync({
      event: instance,
      id: series.id,
      patch: endSeriesPatch(series, instance.recurrenceId!),
    });

  /** Ends the series before the date and starts a new one there with `data`. */
  const changeFollowing = async (
    instance: CalendarEvent,
    series: CalendarEvent,
    data: Record<string, unknown>,
  ) => {
    const calendar: CalendarRef | undefined = calendarOf(calendars, {
      ...series,
      accountId: instance.accountId,
    });
    if (!calendar) throw new Error("Kalender der Serie nicht gefunden.");
    const rule = data.recurrenceRule as RecurrenceRule | null | undefined;
    const before = rule?.count
      ? await datesBefore({ ...series, accountId: instance.accountId }, instance.recurrenceId!)
      : 0;
    await endBeforeDate(instance, series);
    await create.mutateAsync({
      event: { ...data, recurrenceRule: followingRule(rule, before), sequence: 0 },
      calendar,
    });
  };

  return { changeFollowing, endBeforeDate, isPending: create.isPending || update.isPending };
};
