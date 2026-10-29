/**
 * A subscribed calendar (iCal, webcal) kept like the file says: what Stalwart parsed from it
 * (CalendarEvent/parse) becomes one event per UID, and the calendar gets what is new, what
 * changed and loses what the file no longer has. Pure.
 */

export type ParsedEntry = Record<string, unknown> & {
  uid?: string;
  iCalendar?: { name?: string; properties?: unknown[][] };
};

/** What a subscribed event keeps of the file; the rest (method, iCalendar leftovers) goes. */
export const KEPT = [
  "title",
  "description",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "locations",
  "virtualLocations",
  "recurrenceRule",
  "recurrenceOverrides",
  "freeBusyStatus",
  "status",
] as const;

const keep = (entry: ParsedEntry): Record<string, unknown> =>
  Object.fromEntries(
    KEPT.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]),
  );

/**
 * The date a changed date of a series stands for: Stalwart leaves RECURRENCE-ID among the
 * iCalendar leftovers (["recurrence-id", params, type, "20261112" or "20261112T100000"]).
 */
export const recurrenceIdOf = (entry: ParsedEntry): string | undefined => {
  const property = entry.iCalendar?.properties?.find((p) => p[0] === "recurrence-id");
  const value = typeof property?.[3] === "string" ? property[3].replace(/Z$/, "") : undefined;
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/);
  if (!match) return undefined;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
};

/**
 * One event per UID: a series with its changed dates in `recurrenceOverrides`. A changed date
 * without its series in the file stands as an event of its own (the first, if there are several:
 * a calendar holds one event per UID).
 */
export const eventsByUid = (entries: ParsedEntry[]): Map<string, Record<string, unknown>> => {
  const events = new Map<string, Record<string, unknown>>();
  for (const entry of entries.filter((e) => e.uid && !recurrenceIdOf(e))) {
    events.set(entry.uid!, keep(entry));
  }
  for (const entry of entries.filter((e) => e.uid && recurrenceIdOf(e))) {
    const series = events.get(entry.uid!);
    const { recurrenceRule: _rule, recurrenceOverrides: _overrides, ...change } = keep(entry);
    if (!series) {
      events.set(entry.uid!, change);
      continue;
    }
    if (!series.recurrenceRule) continue;
    series.recurrenceOverrides = {
      ...(series.recurrenceOverrides as Record<string, unknown> | undefined),
      [recurrenceIdOf(entry)!]: change,
    };
  }
  return events;
};

/** The same content gives the same text, whatever order the keys came in. */
export const fingerprint = (event: Record<string, unknown>): string =>
  JSON.stringify(keep(event), (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

/** An event in the subscribed calendar now. */
export type StoredEvent = { id: string; uid: string };

export type SyncPlan = {
  create: { uid: string; event: Record<string, unknown> }[];
  update: { id: string; uid: string; event: Record<string, unknown> }[];
  destroy: string[];
  /** What was written per UID afterwards, to compare with the next time. */
  written: Record<string, string>;
};

/**
 * Compared with what Kontext wrote last time (`written`), not with what Stalwart gives back: it
 * fills in defaults, which would make every event look changed on every run.
 */
export const syncPlan = (
  remote: Map<string, Record<string, unknown>>,
  stored: StoredEvent[],
  written: Record<string, string>,
): SyncPlan => {
  const byUid = new Map(stored.map((event) => [event.uid, event]));
  const plan: SyncPlan = { create: [], update: [], destroy: [], written: {} };
  for (const [uid, event] of remote) {
    const known = byUid.get(uid);
    const print = fingerprint(event);
    plan.written[uid] = print;
    if (!known) plan.create.push({ uid, event });
    else if (written[uid] !== print) plan.update.push({ id: known.id, uid, event });
  }
  plan.destroy = stored.filter((event) => !remote.has(event.uid)).map((event) => event.id);
  return plan;
};
