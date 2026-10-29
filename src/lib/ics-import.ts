/**
 * Appointments from an iCalendar file (.ics) for a calendar: what Stalwart parsed from it
 * (CalendarEvent/parse) as one event per UID, ready for CalendarEvent/set, and which of them the
 * account already holds. Used by "Aus Datei übernehmen" in the calendar and by the move
 * (server/migration/). Pure.
 */
import { type CalendarEvent, fromLocal } from "./jscalendar";

/** An entry of CalendarEvent/parse: JSCalendar plus what only describes the file. */
export type ParsedEntry = Record<string, unknown> & {
  uid?: string;
  title?: string;
  start?: string;
  recurrenceId?: string;
};

/** One appointment of the file as it will be created, with what the preview shows of it. */
export type FileEvent = {
  uid: string;
  event: Record<string, unknown>;
  title: string;
  when: Pick<CalendarEvent, "start" | "duration" | "timeZone" | "showWithoutTime">;
  repeats: boolean;
};

export type ImportPlan = {
  /** Not in the account yet, by start. */
  fresh: FileEvent[];
  /** An event with the same UID is already there (Stalwart allows a UID once per account). */
  known: FileEvent[];
};

/**
 * Stalwart refuses `method` on create ("This property is immutable", crates/jmap/src/
 * calendar_event/set.rs); Google's export carries METHOD:PUBLISH, an invitation REQUEST.
 * `recurrenceId` belongs to a changed date whose series the file does not have: on its own it is
 * an appointment of its own.
 */
const MESSAGE_ONLY = ["id", "calendarIds", "method", "recurrenceId", "recurrenceIdTimeZone"];

/** The event for a calendar: without what only described the file, and in that calendar. */
export const prepareEvent = (
  event: Record<string, unknown>,
  calendarId: string,
  uid: string,
): Record<string, unknown> => {
  const rest = Object.fromEntries(
    Object.entries(event).filter(([key]) => !MESSAGE_ONLY.includes(key) && key !== "keywords"),
  );
  // Outlook without categories writes "NONE".
  const kept = Object.keys((event.keywords ?? {}) as Record<string, true>).filter(
    (k) => k !== "NONE",
  );
  return {
    ...rest,
    uid,
    calendarIds: { [calendarId]: true },
    ...(kept.length ? { keywords: Object.fromEntries(kept.map((k) => [k, true])) } : {}),
  };
};

/** cyrb53: a short, stable hash, so an appointment without UID is found again next time. */
const hash = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/** The UID, or one made from the content (`updated` left out: exports stamp the time). */
const uidOf = (entry: ParsedEntry): string => {
  if (typeof entry.uid === "string" && entry.uid) return entry.uid;
  const { updated: _, ...content } = entry;
  return `import-${hash(JSON.stringify(content))}`;
};

/**
 * One event per UID. Stalwart's parse already puts the changed dates of a series into its
 * `recurrenceOverrides` (calcard's into_jscalendar groups by UID); a changed date without its
 * series stays an entry of its own. A calendar holds one event per UID, so the first one counts.
 */
export const fileEvents = (entries: ParsedEntry[]): FileEvent[] => {
  const byUid = new Map<string, FileEvent>();
  for (const entry of [...entries].sort(
    (a, b) => Number(!!a.recurrenceId) - Number(!!b.recurrenceId),
  )) {
    const uid = uidOf(entry);
    if (byUid.has(uid) || typeof entry.start !== "string") continue;
    byUid.set(uid, {
      uid,
      event: entry,
      title: typeof entry.title === "string" ? entry.title : "",
      when: {
        start: entry.start,
        duration: entry.duration as string | undefined,
        timeZone: entry.timeZone as string | null | undefined,
        showWithoutTime: entry.showWithoutTime as boolean | undefined,
      },
      repeats: Boolean(entry.recurrenceRule) && !entry.recurrenceId,
    });
  }
  return [...byUid.values()];
};

const startOf = (item: FileEvent): number =>
  fromLocal(item.when.start, item.when.timeZone).getTime();

/** What is new and what is already there, each by start. */
export const importPlan = (events: FileEvent[], knownUids: Set<string>): ImportPlan => {
  const sorted = [...events].sort((a, b) => startOf(a) - startOf(b));
  return {
    fresh: sorted.filter((item) => !knownUids.has(item.uid)),
    known: sorted.filter((item) => knownUids.has(item.uid)),
  };
};
