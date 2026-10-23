/** Calendars over JMAP (draft-ietf-jmap-calendars). Repeating events come expanded per instance. */
import type { CalendarEvent } from "@/lib/jscalendar";
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
  color: string | null;
  isDefault: boolean;
  isVisible: boolean;
  myRights?: { mayWriteAll?: boolean };
};

export const listCalendars = async (client: JmapClient, accountId: string): Promise<Calendar[]> =>
  (await client.call<{ list: Calendar[] }>("Calendar/get", { accountId }, USING)).list;

/** Events (and instances of repeating events) between two instants. */
export const queryEvents = async (
  client: JmapClient,
  accountId: string,
  after: Date,
  before: Date,
  text?: string,
): Promise<CalendarEvent[]> => {
  const [, get] = await client.request(
    [
      [
        "CalendarEvent/query",
        {
          accountId,
          filter: {
            after: after.toISOString().replace(/\.\d+Z$/, "Z"),
            before: before.toISOString().replace(/\.\d+Z$/, "Z"),
            ...(text ? { text } : {}),
          },
          expandRecurrences: true,
          timeZone: "Europe/Berlin",
          limit: 1000,
        },
        "q",
      ],
      [
        "CalendarEvent/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "CalendarEvent/query", path: "/ids" },
          properties: EVENT_PROPERTIES,
        },
        "g",
      ],
    ],
    USING,
  );
  return (get![1].list as CalendarEvent[]) ?? [];
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
