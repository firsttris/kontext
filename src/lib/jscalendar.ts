/**
 * JSCalendar events (RFC 8984) for the calendar views: local times, durations, week grids and the
 * layout of overlapping events. Times are shown in Europe/Berlin; JMAP stores the event's own zone.
 */
import type { RecurrenceRule } from "./recurrence";

export type Participant = {
  "@type"?: "Participant";
  name?: string;
  email?: string;
  calendarAddress?: string;
  roles?: Record<string, boolean>;
  participationStatus?: "needs-action" | "accepted" | "declined" | "tentative" | "delegated";
  expectReply?: boolean;
};

export type CalendarEvent = {
  id: string;
  /** The account the event was loaded from (own, shared mailbox or a colleague's); set by the app. */
  accountId?: string;
  /** The colour of its calendar; set by the app. */
  color?: string;
  uid?: string;
  calendarIds: Record<string, boolean>;
  title?: string;
  description?: string;
  start: string;
  timeZone?: string | null;
  duration?: string;
  showWithoutTime?: boolean;
  locations?: Record<string, { name?: string }>;
  /** Online places, such as the link to a Kontext meeting (RFC 8984 §5.1.6). */
  virtualLocations?: Record<string, { name?: string; uri?: string }>;
  participants?: Record<string, Participant>;
  /** Links to what belongs to it, such as documents of Dokumente (RFC 8984 §4.2.7). */
  links?: Record<string, { href: string; title?: string }> | null;
  organizerCalendarAddress?: string;
  /** "free" when the time does not count as busy (RFC 8984 §5.2.2); "busy" when left out. */
  freeBusyStatus?: "free" | "busy";
  recurrenceRule?: RecurrenceRule | null;
  recurrenceOverrides?: Record<string, Record<string, unknown>> | null;
  /** Set on instances of a repeating event. */
  recurrenceId?: string | null;
  baseEventId?: string | null;
  utcStart?: string;
  utcEnd?: string;
};

export const ZONE = "Europe/Berlin";

const pad = (n: number): string => String(n).padStart(2, "0");

/** "2026-10-23" for a Date, in the given zone. */
export const dateKey = (date: Date, zone = ZONE): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(date);

const zonedParts = (date: Date, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
    s: get("second"),
  };
};

/** Local date-time "YYYY-MM-DDTHH:MM:SS" of an instant in a zone. */
export const toLocal = (date: Date, zone = ZONE): string => {
  const p = zonedParts(date, zone);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
};

/** The instant of a local date-time in a zone (handles daylight saving time). */
export const fromLocal = (local: string, zone: string | null | undefined = ZONE): Date => {
  const [datePart, timePart = "00:00:00"] = local.split("T");
  const [y, mo, d] = datePart!.split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = timePart.split(":").map(Number);
  const asUtc = Date.UTC(y!, mo! - 1, d!, h, mi, s);
  if (!zone || zone === "Etc/UTC" || zone === "UTC") return new Date(asUtc);
  // Two passes: the offset at the guessed instant, then at the corrected one.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), zone);
    const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    guess += asUtc - shown;
  }
  return new Date(guess);
};

/** ISO 8601 duration ("PT1H30M", "P1D", "P1W") in minutes. */
export const durationMinutes = (duration: string | undefined): number => {
  if (!duration) return 0;
  const match = duration.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [, w, d, h, m, s] = match.map((v) => Number(v ?? 0));
  return w! * 10080 + d! * 1440 + h! * 60 + m! + Math.round(s! / 60);
};

export const toDuration = (minutes: number): string => {
  if (minutes <= 0) return "PT0S";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const time = `${hours ? `${hours}H` : ""}${mins ? `${mins}M` : ""}`;
  return `P${days ? `${days}D` : ""}${time ? `T${time}` : ""}`;
};

/** Adds minutes to a local date-time as on a wall clock ("…T09:00:00" + 30 → "…T09:30:00"). */
export const shiftLocal = (local: string, minutes: number): string =>
  new Date(Date.parse(`${local}Z`) + minutes * 60_000).toISOString().slice(0, 19);

/** Minutes between two local date-times, on the wall clock. */
export const localDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60_000);

/**
 * The end of a timed event: its duration added to the local start on the wall clock, a day as
 * 24 hours, then resolved in the event's zone. This is how Stalwart 0.16.27 computes utcEnd
 * (crates/groupware/src/calendar/dates.rs `start_timestamp_naive + delta` with calcard 0.3.14's
 * `as_seconds`, resolved by expand.rs `resolve_local`) and how it writes DTEND for CalDAV clients
 * (calcard jscalendar/export/convert.rs). It deviates from RFC 5545 §3.3.6, where only days are
 * nominal; the app follows the server so that saving and reading agree across the clock change.
 */
const localEnd = (event: CalendarEvent): Date =>
  fromLocal(shiftLocal(event.start, durationMinutes(event.duration)), event.timeZone);

export type Timed = { start: Date; end: Date; allDay: boolean };

/**
 * An all-day event spans whole local days: from midnight of its start date to midnight `duration`
 * calendar days later (at least one). Its utcStart/utcEnd are not used: they depend on the zone the
 * server resolved the floating times in (Stalwart takes UTC when CalendarEvent/get has no
 * `timeZone` argument, crates/jmap/src/calendar_event/get.rs), which shifted the event by hours.
 */
const allDayTimes = (event: CalendarEvent): Timed => {
  const date = event.start.slice(0, 10);
  const days = Math.max(1, Math.ceil(durationMinutes(event.duration) / 1440));
  return {
    start: fromLocal(`${date}T00:00:00`),
    end: fromLocal(`${addDays(date, days)}T00:00:00`),
    allDay: true,
  };
};

/**
 * Gives an expanded instance back the all-day flag of its stored event. With `expandRecurrences`
 * every event of the query is an instance (single ones too), and Stalwart writes an instance's
 * start as a date-time in the request's zone: a floating all-day event comes back as 00:00 to
 * 00:00 in Berlin without showWithoutTime (crates/jmap/src/calendar_event/get.rs,
 * `expand_from_ids`). A date changed on its own (it carries showWithoutTime: false) or moved to
 * a time of day stays timed.
 */
export const withAllDayOf =
  (bases: Map<string, Pick<CalendarEvent, "showWithoutTime" | "timeZone">>) =>
  (event: CalendarEvent): CalendarEvent => {
    const base = event.baseEventId ? bases.get(event.baseEventId) : undefined;
    // A changed date (an override) states its own showWithoutTime; only plain instances lack it.
    const ownFlag = event.showWithoutTime !== undefined;
    if (!base?.showWithoutTime || ownFlag || !event.start.endsWith("T00:00:00")) {
      return event;
    }
    return { ...event, showWithoutTime: true, timeZone: base.timeZone ?? null };
  };

/** Start and end as instants. All-day events span whole local days. */
export const eventTimes = (event: CalendarEvent): Timed => {
  if (event.showWithoutTime) return allDayTimes(event);
  const start = event.utcStart ? new Date(event.utcStart) : fromLocal(event.start, event.timeZone);
  const end = event.utcEnd ? new Date(event.utcEnd) : localEnd(event);
  return { start, end, allDay: false };
};

export const addDays = (key: string, days: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
};

/** The first of the month `months` away from the day's month. */
export const addMonths = (key: string, months: number): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + months, 1)).toISOString().slice(0, 10);
};

/** Monday of the week that contains the day. */
export const weekStart = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
  return addDays(key, -weekday);
};

export const weekDays = (key: string): string[] => {
  const monday = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

/** ISO 8601 week number. */
export const isoWeek = (key: string): number => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  );
};

/** Minutes since local midnight of the given day; clamped to the day. */
export const minutesInDay = (instant: Date, key: string): number => {
  const local = toLocal(instant);
  if (local.slice(0, 10) < key) return 0;
  if (local.slice(0, 10) > key) return 1440;
  const [h, m] = local.slice(11, 16).split(":").map(Number);
  return h! * 60 + m!;
};

export type PlacedEvent = {
  event: CalendarEvent;
  top: number;
  height: number;
  column: number;
  columns: number;
};

/**
 * Places the timed events of one day: overlapping events share the width in columns, like in
 * every calendar app. Returns minutes from midnight for top and height.
 */
export const layoutDay = (events: CalendarEvent[], key: string, minHeight = 20): PlacedEvent[] => {
  const items = events
    .map((event) => {
      const { start, end } = eventTimes(event);
      const top = minutesInDay(start, key);
      const bottom = Math.max(minutesInDay(end, key), top + minHeight);
      return { event, top, bottom };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const placed: PlacedEvent[] = [];
  let group: ((typeof items)[number] & { column: number })[] = [];
  let groupEnd = -1;

  const flush = () => {
    const columns = Math.max(1, ...group.map((item) => item.column + 1));
    for (const item of group) {
      placed.push({
        event: item.event,
        top: item.top,
        height: item.bottom - item.top,
        column: item.column,
        columns,
      });
    }
    group = [];
  };

  for (const item of items) {
    if (item.top >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(
      group.filter((other) => other.bottom > item.top).map((other) => other.column),
    );
    let column = 0;
    while (used.has(column)) column++;
    group.push({ ...item, column });
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  flush();
  return placed;
};

/** Does the event touch the local day? */
export const onDay = (event: CalendarEvent, key: string): boolean => {
  const { start, end, allDay } = eventTimes(event);
  const from = fromLocal(`${key}T00:00:00`);
  const to = fromLocal(`${addDays(key, 1)}T00:00:00`);
  if (allDay) return start < to && end > from;
  return start < to && (end > from || (end.getTime() === start.getTime() && start >= from));
};

/**
 * A Kontext meeting's link (http(s)://host/meet/<id>), the way into its video meeting. Anchored
 * at both ends: the link goes into an href, and an invitation from outside could start it with
 * `javascript:`.
 */
const MEETING_LINK = /^https?:\/\/[^/\s?#]+\/meet\/[A-Za-z0-9_-]{16,64}$/;
export const isMeetingLink = (uri: string): boolean => MEETING_LINK.test(uri);

export const meetingLink = (event: Pick<CalendarEvent, "virtualLocations">): string =>
  Object.values(event.virtualLocations ?? {})
    .map((place) => place.uri ?? "")
    .find(isMeetingLink) ?? "";

export const locationName = (event: CalendarEvent): string =>
  Object.values(event.locations ?? {})
    .map((location) => location.name)
    .filter(Boolean)
    .join(", ");

export const participantEmail = (participant: Participant): string =>
  (participant.calendarAddress ?? participant.email ?? "").replace(/^mailto:/i, "");

export const attendees = (event: CalendarEvent): [string, Participant][] =>
  Object.entries(event.participants ?? {});

/** The participant entry of the user, if the event lists them. */
export const myParticipation = (
  event: CalendarEvent,
  myAddresses: string[],
): [string, Participant] | undefined => {
  const mine = new Set(myAddresses.map((a) => a.toLowerCase()));
  return attendees(event).find(([, p]) => mine.has(participantEmail(p).toLowerCase()));
};

export const isOrganizer = (event: CalendarEvent, myAddresses: string[]): boolean => {
  if (!event.organizerCalendarAddress) return true;
  const organizer = event.organizerCalendarAddress.replace(/^mailto:/i, "").toLowerCase();
  return myAddresses.some((a) => a.toLowerCase() === organizer);
};

/** Event ids are only unique within an account. */
export const eventKey = (event: CalendarEvent): string => `${event.accountId ?? ""}/${event.id}`;

/**
 * Is this one date of a repeating event? The expanded query gives every event a `baseEventId`;
 * only dates of a series also carry a `recurrenceId`.
 */
export const isInstance = (event: CalendarEvent): boolean =>
  Boolean(event.baseEventId && event.recurrenceId);

export const timeLabel = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
