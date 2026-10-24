/** Calendars over JMAP (draft-ietf-jmap-calendars). Repeating events come expanded per instance. */

import { chunk } from "@/lib/chunk";
import type { CalendarEvent } from "@/lib/jscalendar";
import type { Rights, ShareWith } from "@/lib/sharing";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.calendars];

const EVENT_PROPERTIES = [
  "calendarIds",
  "uid",
  "title",
  "description",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "locations",
  "virtualLocations",
  "participants",
  "organizerCalendarAddress",
  "recurrenceRule",
  "recurrenceOverrides",
  "recurrenceId",
  "baseEventId",
  "utcStart",
  "utcEnd",
];

export type Calendar = {
  id: string;
  name: string;
  /** Per user: everyone picks their own colour and whether it is shown. */
  color: string | null;
  isDefault: boolean;
  isVisible: boolean;
  /** Only the owner sees whom it is shared with. */
  shareWith?: ShareWith | null;
  myRights?: Rights;
};

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

/** Name, colour or `shareWith`. */
export const updateCalendar = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: Partial<Pick<Calendar, "name" | "color" | "shareWith">>,
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
  const { ids } = await client.call<{ ids: string[] }>(
    "CalendarEvent/query",
    {
      accountId,
      filter: {
        after: after.toISOString().replace(/\.\d+Z$/, "Z"),
        before: before.toISOString().replace(/\.\d+Z$/, "Z"),
        ...(text ? { text } : {}),
        ...(calendarId ? { inCalendar: calendarId } : {}),
      },
      expandRecurrences: true,
      timeZone: "Europe/Berlin",
      limit: 5000,
    },
    USING,
  );
  // At most `maxObjectsInGet` (500) per call, one call after the other.
  const events: CalendarEvent[] = [];
  for (const page of chunk(ids, 500)) {
    const { list } = await client.call<{ list: CalendarEvent[] }>(
      "CalendarEvent/get",
      { accountId, ids: page, properties: EVENT_PROPERTIES },
      USING,
    );
    events.push(...list);
  }
  return events;
};

/** One stored event, e.g. the series behind an instance (which carries the rule). */
export const getEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<CalendarEvent | null> =>
  (
    await client.call<{ list: CalendarEvent[] }>(
      "CalendarEvent/get",
      { accountId, ids: [id], properties: EVENT_PROPERTIES },
      USING,
    )
  ).list[0] ?? null;

/**
 * Changing or deleting an instance id changes only that date: Stalwart writes it to the series'
 * `recurrenceOverrides` (an exclusion for a delete). The base id changes the whole series.
 */
export const createEvent = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  event: Record<string, unknown>,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    {
      accountId,
      sendSchedulingMessages: true,
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

export const updateEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages: true, update: { [id]: patch } },
      USING,
    ),
    "Termin",
  );
};

export const deleteEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages: true, destroy: [id] },
      USING,
    ),
    "Termin",
  );
};

/** Accept, decline or maybe: the server tells the organizer (iMIP reply). */
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
