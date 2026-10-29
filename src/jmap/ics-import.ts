/**
 * "Aus Datei übernehmen": an .ics file read by Stalwart (Blob upload, then CalendarEvent/parse,
 * draft-ietf-jmap-calendars), the UIDs the target account already holds, and the new appointments
 * written without scheduling messages: an import invites nobody.
 */
import { chunk } from "@/lib/chunk";
import { type FileEvent, type ParsedEntry, prepareEvent } from "@/lib/ics-import";
import { CAPABILITIES, type JmapClient, jmapError } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.calendars, CAPABILITIES.calendarsParse];
/** Below Stalwart's maxObjectsInGet and maxObjectsInSet. */
const PAGE = 500;
const SET_PAGE = 100;

type SetError = { type: string; description?: string; properties?: string[] };

/** Every entry of the file; throws when Stalwart cannot read it as iCalendar. */
export const parseCalendarFile = async (
  client: JmapClient,
  accountId: string,
  file: Blob,
): Promise<ParsedEntry[]> => {
  const { blobId } = await client.upload(accountId, file, "text/calendar");
  const { parsed } = await client.call<{ parsed?: Record<string, ParsedEntry[]> }>(
    "CalendarEvent/parse",
    { accountId, blobIds: [blobId] },
    USING,
  );
  const entries = parsed?.[blobId];
  if (!entries) throw jmapError("Keine iCalendar-Datei", "notParsable");
  return entries;
};

/**
 * The UIDs of all events the user sees in the account. Stalwart allows a UID once per account,
 * not per calendar (crates/jmap/src/calendar_event/mod.rs, `assert_is_unique_uid`).
 */
export const accountUids = async (client: JmapClient, accountId: string): Promise<Set<string>> => {
  const uids = new Set<string>();
  for (let position = 0; ; position += PAGE) {
    const [query, get] = await client.request(
      [
        ["CalendarEvent/query", { accountId, position, limit: PAGE }, "q"],
        [
          "CalendarEvent/get",
          {
            accountId,
            "#ids": { resultOf: "q", name: "CalendarEvent/query", path: "/ids" },
            properties: ["uid"],
          },
          "g",
        ],
      ],
      USING,
    );
    for (const event of (get![1].list ?? []) as { uid?: string }[]) {
      if (event.uid) uids.add(event.uid);
    }
    if ((query![1].ids as string[]).length < PAGE) return uids;
  }
};

export type ImportOutcome = { imported: number; skipped: number; failed: string[] };

/**
 * Creates the appointments in one calendar. One whose UID turns out to be taken (in a calendar of
 * the account the user cannot see) counts as already there.
 */
export const importFileEvents = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  events: FileEvent[],
): Promise<ImportOutcome> => {
  const outcome: ImportOutcome = { imported: 0, skipped: 0, failed: [] };
  for (const page of chunk(events, SET_PAGE)) {
    const create = Object.fromEntries(
      page.map((item, index) => [`e${index}`, prepareEvent(item.event, calendarId, item.uid)]),
    );
    const result = await client.call<{
      created?: Record<string, unknown>;
      notCreated?: Record<string, SetError>;
    }>("CalendarEvent/set", { accountId, sendSchedulingMessages: false, create }, USING);
    outcome.imported += Object.keys(result.created ?? {}).length;
    for (const error of Object.values(result.notCreated ?? {})) {
      if (error.properties?.includes("uid")) outcome.skipped++;
      else outcome.failed.push(error.description ?? error.type);
    }
  }
  return outcome;
};
