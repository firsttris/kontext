/** Calendars over JMAP (draft-ietf-jmap-calendars). Repeating events come expanded per instance. */

import { chunk } from "@/lib/chunk";
import { type CalendarEvent, withAllDayOf, ZONE } from "@/lib/jscalendar";
import type { DefaultAlerts } from "@/lib/reminders";
import type { Rights, ShareWith } from "@/lib/sharing";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.calendars];

/**
 * What every event is read with. Stalwart 1.0 refuses recurrenceOverrides together with
 * utcStart/utcEnd (crates/jmap/src/calendar_event/get.rs): the dates of a view take the UTC times,
 * a stored event (the series) its changed dates; eventTimes works with either.
 */
const BASE_PROPERTIES = [
  "calendarIds",
  "uid",
  "sequence",
  "title",
  "description",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "locations",
  "virtualLocations",
  "participants",
  "links",
  "organizerCalendarAddress",
  "freeBusyStatus",
  "recurrenceRule",
  "alerts",
  "recurrenceId",
  "baseEventId",
];
const INSTANCE_PROPERTIES = [...BASE_PROPERTIES, "utcStart", "utcEnd"];
const EVENT_PROPERTIES = [...BASE_PROPERTIES, "recurrenceOverrides"];

/**
 * The longest span one expanded query may cover, a day below Stalwart's maxExpandedQueryDuration
 * (P52W1D, 365 days; crates/jmap/src/calendar_event/query.rs refuses more since 1.0).
 */
const MAX_EXPAND_MS = 364 * 86_400_000;

/** `after` … `before` in consecutive spans of at most `max` milliseconds. Pure. */
export const expandSpans = (after: Date, before: Date, max = MAX_EXPAND_MS): [Date, Date][] => {
  const spans: [Date, Date][] = [];
  for (let start = after.getTime(); start < before.getTime(); start += max)
    spans.push([new Date(start), new Date(Math.min(start + max, before.getTime()))]);
  return spans;
};

export type Calendar = {
  id: string;
  name: string;
  /** Per user: everyone picks their own colour and whether it is shown. */
  color: string | null;
  isDefault: boolean;
  isVisible: boolean;
  /**
   * Whether its events count as busy when colleagues plan a meeting: "all", only those the user
   * attends, or "none" (draft-ietf-jmap-calendars). Stalwart keeps it per user.
   */
  includeInAvailability?: "all" | "attending" | "none";
  /** Only the owner sees whom it is shared with. */
  shareWith?: ShareWith | null;
  myRights?: Rights;
} & DefaultAlerts;

export const listCalendars = async (client: JmapClient, accountId: string): Promise<Calendar[]> =>
  (await client.call<{ list: Calendar[] }>("Calendar/get", { accountId }, USING)).list;

export const createCalendar = async (
  client: JmapClient,
  accountId: string,
  calendar: { name: string; color?: string },
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "Calendar/set",
    { accountId, create: { c: calendar } },
    USING,
  );
  assertSetOk(result, "Kalender");
  return result.created!.c!.id;
};

/** Name, colour, `shareWith`, whether it counts for free and busy times, or its default alerts. */
export const updateCalendar = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: Partial<
    Pick<
      Calendar,
      | "name"
      | "color"
      | "shareWith"
      | "includeInAvailability"
      | "defaultAlertsWithTime"
      | "defaultAlertsWithoutTime"
    >
  >,
): Promise<void> => {
  assertSetOk(
    await client.call("Calendar/set", { accountId, update: { [id]: patch } }, USING),
    "Kalender",
  );
};

/** Deletes the calendar together with its events. */
export const deleteCalendar = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "Calendar/set",
      { accountId, destroy: [id], onDestroyRemoveEvents: true },
      USING,
    ),
    "Kalender",
  );
};

/**
 * Works around Stalwart 0.16.27: once a date of a series is changed, get on the series' id returns
 * that override's properties as the series' (crates/jmap/src/calendar_event/get.rs,
 * `into_jscalendar_with_opt(... .return_first(true))` picks the first component). A
 * recurrenceOverridesAfter/Before window no override falls into (draft-ietf-jmap-calendars
 * CalendarEvent/get) drops the overrides first (same file, `override_range`), so the series'
 * own values come back.
 */
const WITHOUT_OVERRIDES = {
  recurrenceOverridesAfter: "9999-12-30T00:00:00Z",
  recurrenceOverridesBefore: "9999-12-31T00:00:00Z",
};

/**
 * At most `maxObjectsInGet` (500) per call, one call after the other. Like the query, get takes
 * the app's zone: Stalwart resolves floating times (all-day events) and the instances in it, and
 * in UTC without it (crates/jmap/src/calendar_event/get.rs, `default_tz`).
 */
const getEvents = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
  properties: string[],
  extra: Record<string, unknown> = {},
): Promise<CalendarEvent[]> => {
  const events: CalendarEvent[] = [];
  for (const page of chunk(ids, 500)) {
    const { list } = await client.call<{ list: CalendarEvent[] }>(
      "CalendarEvent/get",
      { accountId, ids: page, properties, timeZone: ZONE, ...extra },
      USING,
    );
    events.push(...list);
  }
  return events;
};

/**
 * Events (and instances of repeating events) between two instants, of one calendar or (without
 * `calendarId`) the whole account. Calendars of other accounts are always asked one by one, so
 * the result holds exactly what is in the calendars the user can see.
 */
export const queryEvents = async (
  client: JmapClient,
  accountId: string,
  after: Date,
  before: Date,
  { text, calendarId }: { text?: string; calendarId?: string } = {},
): Promise<CalendarEvent[]> => {
  const ids = new Set<string>();
  for (const [from, to] of expandSpans(after, before)) {
    const answer = await client.call<{ ids: string[] }>(
      "CalendarEvent/query",
      {
        accountId,
        filter: {
          after: from.toISOString().replace(/\.\d+Z$/, "Z"),
          before: to.toISOString().replace(/\.\d+Z$/, "Z"),
          ...(text ? { text } : {}),
          ...(calendarId ? { inCalendar: calendarId } : {}),
        },
        expandRecurrences: true,
        timeZone: ZONE,
        limit: 5000,
      },
      USING,
    );
    for (const id of answer.ids) ids.add(id);
  }
  const events = await getEvents(client, accountId, [...ids], INSTANCE_PROPERTIES);
  const baseIds = [...new Set(events.flatMap((event) => event.baseEventId ?? []))];
  const bases = await getEvents(
    client,
    accountId,
    baseIds,
    ["showWithoutTime", "timeZone"],
    WITHOUT_OVERRIDES,
  );
  return events.map(withAllDayOf(new Map(bases.map((base) => [base.id, base]))));
};

/** One stored event, e.g. the series behind an instance (which carries the rule). */
export const getEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<CalendarEvent | null> =>
  (await getEvents(client, accountId, [id], EVENT_PROPERTIES))[0] ?? null;

/**
 * The event as stored, the series for a date of one: its own properties (WITHOUT_OVERRIDES, see
 * there) and its changed dates. What an invitation is made of.
 */
export const getStoredEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<CalendarEvent | null> => {
  const [found] = await getEvents(client, accountId, [id], ["baseEventId"]);
  if (!found) return null;
  const baseId = found.baseEventId ?? id;
  const [own] = await getEvents(client, accountId, [baseId], EVENT_PROPERTIES, WITHOUT_OVERRIDES);
  if (!own) return null;
  const [dates] = await getEvents(client, accountId, [baseId], ["recurrenceOverrides"]);
  return { ...own, id: baseId, recurrenceOverrides: dates?.recurrenceOverrides ?? null };
};

/**
 * Who sends the invitations: Stalwart (`true`: its own mails, crates/services/src/task_manager/
 * imip.rs) or Kontext, which then sends them itself (invitations.ts).
 */
export type Scheduling = { sendSchedulingMessages: boolean };

const STALWART_SENDS: Scheduling = { sendSchedulingMessages: true };

/**
 * Changing or deleting an instance id changes only that date: Stalwart writes it to the series'
 * `recurrenceOverrides` (an exclusion for a delete). The base id changes the whole series.
 */
export const createEvent = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  event: Record<string, unknown>,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    {
      accountId,
      sendSchedulingMessages,
      create: {
        e: {
          "@type": "Event",
          uid: crypto.randomUUID(),
          calendarIds: { [calendarId]: true },
          ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== null)),
        },
      },
    },
    USING,
  );
  assertSetOk(result, "Termin");
  return result.created!.e!.id;
};

/**
 * Several events into one calendar, without invitations (such as public holidays); at most 100 per
 * call, below Stalwart's `maxObjectsInSet`.
 */
export const createEvents = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  events: Record<string, unknown>[],
): Promise<void> => {
  for (const page of chunk(events, 100)) {
    const create = Object.fromEntries(
      page.map((event, index) => [
        `e${index}`,
        {
          "@type": "Event",
          uid: crypto.randomUUID(),
          calendarIds: { [calendarId]: true },
          ...event,
        },
      ]),
    );
    assertSetOk(
      await client.call(
        "CalendarEvent/set",
        { accountId, sendSchedulingMessages: false, create },
        USING,
      ),
      "Termin",
    );
  }
};

export const updateEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: Record<string, unknown>,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages, update: { [id]: patch } },
      USING,
    ),
    "Termin",
  );
};

export const deleteEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages, destroy: [id] },
      USING,
    ),
    "Termin",
  );
};

/** Accept, decline or maybe: Stalwart tells the organizer (iMIP REPLY), also one outside. */
export const respondToEvent = (
  client: JmapClient,
  accountId: string,
  id: string,
  participantId: string,
  status: "accepted" | "declined" | "tentative",
) =>
  updateEvent(client, accountId, id, {
    [`participants/${participantId}/participationStatus`]: status,
  });
