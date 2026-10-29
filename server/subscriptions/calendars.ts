/**
 * The subscribed calendars in Stalwart, written with the server's key (needs `impersonate`, see
 * server/company/mailstore.ts): the calendar itself, its events by UID, the file parsed by
 * Stalwart (CalendarEvent/parse, the same as the move does) and the changes. Without scheduling:
 * nobody is invited to a subscribed event.
 */
import type { StalwartRequest } from "../company/management";
import type { ParsedEntry, StoredEvent, SyncPlan } from "./sync-plan";

const CORE = "urn:ietf:params:jmap:core";
const CALENDARS = [
  CORE,
  "urn:ietf:params:jmap:calendars",
  "urn:ietf:params:jmap:calendars:parse",
  "urn:ietf:params:jmap:blob",
];
const PAGE = 250;

type Result = Record<string, unknown>;

const failedIn = (result: Result): string | null => {
  for (const key of ["notCreated", "notUpdated", "notDestroyed"]) {
    const failed = Object.values(
      (result[key] ?? {}) as Record<string, { type: string; description?: string }>,
    );
    if (failed[0]) return failed[0].description ?? failed[0].type;
  }
  return null;
};

export const createSubscribedCalendars = (request: StalwartRequest) => {
  const call = async (method: string, args: Record<string, unknown>): Promise<Result> => {
    const [[, result]] = (await request([[method, args, "0"]], CALENDARS)) as [
      [string, Result, string],
    ];
    return result;
  };

  /**
   * A calendar of its own for the subscription. It does not count for availability: holidays or
   * the waste collection do not make anyone busy.
   */
  const create = async (accountId: string, name: string): Promise<string> => {
    const result = await call("Calendar/set", {
      accountId,
      create: { c: { name, includeInAvailability: "none" } },
    });
    const id = (result.created as Record<string, { id: string }> | undefined)?.c?.id;
    if (!id) throw new Error(failedIn(result) ?? "Kalender nicht angelegt");
    return id;
  };

  /** Whether the calendar is still there (its owner may delete it like any other). */
  const exists = async (accountId: string, calendarId: string): Promise<boolean> => {
    const { list } = (await call("Calendar/get", {
      accountId,
      ids: [calendarId],
      properties: ["name"],
    })) as { list: unknown[] };
    return list.length > 0;
  };

  const remove = async (accountId: string, calendarId: string) => {
    await call("Calendar/set", { accountId, destroy: [calendarId], onDestroyRemoveEvents: true });
  };

  const events = async (accountId: string, calendarId: string): Promise<StoredEvent[]> => {
    const { ids } = (await call("CalendarEvent/query", {
      accountId,
      filter: { inCalendar: calendarId },
    })) as { ids: string[] };
    const found: StoredEvent[] = [];
    for (let at = 0; at < ids.length; at += PAGE) {
      const { list } = (await call("CalendarEvent/get", {
        accountId,
        ids: ids.slice(at, at + PAGE),
        properties: ["uid"],
      })) as { list: StoredEvent[] };
      found.push(...list);
    }
    return found;
  };

  const parse = async (accountId: string, text: string): Promise<ParsedEntry[]> => {
    const [uploaded, parsed] = await request(
      [
        [
          "Blob/upload",
          { accountId, create: { b: { data: [{ "data:asText": text }], type: "text/calendar" } } },
          "u",
        ],
        ["CalendarEvent/parse", { accountId, blobIds: ["#b"] }, "p"],
      ],
      CALENDARS,
    );
    const blobId = ((uploaded![1].created ?? {}) as Record<string, { id: string }>).b?.id ?? "";
    const value = ((parsed![1].parsed ?? {}) as Record<string, ParsedEntry[]>)[blobId];
    return Array.isArray(value) ? value : [];
  };

  /** Writes the plan in pages; the first refusal stops it with its reason. */
  const apply = async (accountId: string, calendarId: string, plan: SyncPlan) => {
    const set = async (args: Record<string, unknown>) => {
      const failed = failedIn(
        await call("CalendarEvent/set", { accountId, sendSchedulingMessages: false, ...args }),
      );
      if (failed) throw new Error(failed);
    };
    for (let at = 0; at < plan.create.length; at += PAGE) {
      const page = plan.create.slice(at, at + PAGE);
      await set({
        create: Object.fromEntries(
          page.map(({ uid, event }, index) => [
            `e${index}`,
            { "@type": "Event", ...event, uid, calendarIds: { [calendarId]: true } },
          ]),
        ),
      });
    }
    for (let at = 0; at < plan.update.length; at += PAGE) {
      const page = plan.update.slice(at, at + PAGE);
      await set({
        update: Object.fromEntries(
          page.map(({ id, event }) => [
            id,
            { recurrenceRule: null, recurrenceOverrides: null, ...event },
          ]),
        ),
      });
    }
    for (let at = 0; at < plan.destroy.length; at += PAGE) {
      await set({ destroy: plan.destroy.slice(at, at + PAGE) });
    }
  };

  return { create, exists, remove, events, parse, apply };
};

export type SubscribedCalendars = ReturnType<typeof createSubscribedCalendars>;
