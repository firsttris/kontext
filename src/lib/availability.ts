/**
 * Colleagues' free and busy times for planning an appointment: what each attendee is doing at the
 * chosen time, and the next times in which everyone is free. Pure functions over the busy periods
 * that `Principal/getAvailability` returns (draft-ietf-jmap-calendars, Stalwart
 * crates/jmap/src/principal/availability.rs). Times are epoch milliseconds.
 */
import { addDays, dateKey, fromLocal } from "./jscalendar";

export type BusyStatus = "confirmed" | "tentative" | "unavailable";

export type Busy = { start: number; end: number; status: BusyStatus };

/** One attendee: their busy periods, or null when Kontext cannot know (someone outside the company). */
export type Schedule = { email: string; busy: Busy[] | null };

export type PersonStatus =
  | { kind: "free" }
  | { kind: "busy"; until: number; tentative: boolean }
  | { kind: "unknown" };

export type Slot = { start: number; end: number };

/** The working day the suggestions stay in, in local hours, and which weekdays (0 = Sunday). */
export type Workday = { startHour: number; endHour: number; weekdays: number[] };

export const WORKDAY: Workday = { startHour: 7, endHour: 18, weekdays: [1, 2, 3, 4, 5] };

const overlaps = (busy: Busy, start: number, end: number): boolean =>
  busy.start < end && busy.end > start;

/** Whether the attendee is free between `start` and `end`; when not, until when they are busy. */
export const statusDuring = (busy: Busy[] | null, start: number, end: number): PersonStatus => {
  if (!busy) return { kind: "unknown" };
  const hits = busy.filter((b) => overlaps(b, start, end));
  if (!hits.length) return { kind: "free" };
  return {
    kind: "busy",
    until: Math.max(...hits.map((b) => b.end)),
    tentative: hits.every((b) => b.status === "tentative"),
  };
};

/** All busy periods of everyone, sorted and joined where they touch or overlap. */
export const mergeBusy = (schedules: Schedule[]): Slot[] =>
  schedules
    .flatMap((s) => s.busy ?? [])
    .map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start)
    .reduce<Slot[]>((merged, period) => {
      const last = merged.at(-1);
      if (last && period.start <= last.end) last.end = Math.max(last.end, period.end);
      else merged.push({ ...period });
      return merged;
    }, []);

const STEP = 30 * 60_000;

/** The first instant at or after `time` on the half hour. */
const ceilToStep = (time: number): number => Math.ceil(time / STEP) * STEP;

/** The working hours of one local day, or null on a day off. */
const workingHours = (day: string, workday: Workday): Slot | null => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (!workday.weekdays.includes(weekday)) return null;
  const hour = (h: number) => `${day}T${String(h).padStart(2, "0")}:00:00`;
  return {
    start: fromLocal(hour(workday.startHour)).getTime(),
    end: fromLocal(hour(workday.endHour)).getTime(),
  };
};

/**
 * The next times of `minutes` length, from `from` on, in which every attendee whose times are
 * known is free: on the half hour, inside the working day, at most `limit`, looking `days` ahead.
 */
export const freeSlots = (
  schedules: Schedule[],
  from: number,
  minutes: number,
  {
    workday = WORKDAY,
    limit = 3,
    days = 14,
  }: { workday?: Workday; limit?: number; days?: number } = {},
): Slot[] => {
  const busy = mergeBusy(schedules);
  const length = minutes * 60_000;
  const slots: Slot[] = [];
  const firstDay = dateKey(new Date(from));
  for (let offset = 0; offset < days && slots.length < limit; offset++) {
    const hours = workingHours(addDays(firstDay, offset), workday);
    if (!hours) continue;
    let start = ceilToStep(Math.max(hours.start, from));
    while (start + length <= hours.end && slots.length < limit) {
      const end = start + length;
      const blocking = busy.find((b) => b.start < end && b.end > start);
      if (blocking) {
        start = ceilToStep(blocking.end);
        continue;
      }
      slots.push({ start, end });
      // The next suggestion after this one, not half an hour later.
      start = end;
    }
  }
  return slots;
};

/** The busy periods of one local day, cut to the hours shown, as fractions of that span. */
export const dayBars = (
  busy: Busy[],
  day: string,
  { startHour, endHour }: Pick<Workday, "startHour" | "endHour">,
): { left: number; width: number; status: BusyStatus }[] => {
  const hour = (h: number) => fromLocal(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime();
  const from = hour(startHour);
  const to = hour(endHour);
  const span = to - from;
  return busy
    .filter((b) => overlaps(b, from, to))
    .map((b) => {
      const start = Math.max(b.start, from);
      const end = Math.min(b.end, to);
      return { left: (start - from) / span, width: (end - start) / span, status: b.status };
    });
};

/**
 * Leaves out the appointment being edited: it sits in every attendee's calendar with the same
 * times, and would otherwise clash with itself.
 */
export const withoutEvent = (schedules: Schedule[], event: Slot | null): Schedule[] =>
  event
    ? schedules.map((s) => ({
        ...s,
        busy: s.busy?.filter((b) => b.start !== event.start || b.end !== event.end) ?? null,
      }))
    : schedules;
