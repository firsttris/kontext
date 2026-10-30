/**
 * Calendar events (draft-ietf-jmap-calendars, JSCalendar RFC 8984): query with the dates of a
 * series expanded, get, set, and scheduling between colleagues. As in Stalwart, a date of a series
 * has an id of its own; changing or deleting it writes the series' `recurrenceOverrides`.
 *
 * Scheduling: an event lives once in every calendar of the company it concerns – the organizer's
 * and each colleague's who attends – under the same uid. What one of them changes reaches the
 * others (Stalwart does it with iTIP mails); invitations to anyone outside go nowhere.
 */
import { durationMinutes, fromLocal, shiftLocal, toLocal, ZONE } from "@/lib/jscalendar";
import type { RecurrenceRule } from "@/lib/recurrence";
import { defaultCollection } from "./collections";
import { type Args, applyPatch, type Created, changed, type Result, state } from "./methods";
import { occurrences } from "./recurrence";
import { accountOf, newId, type Store, type StoredObject } from "./store";

type Overrides = Record<string, Record<string, unknown>>;

const utc = (date: Date) => date.toISOString().replace(/\.\d+Z$/, "Z");

/** Start and end as instants: the local start in the event's zone plus its duration. */
const timesOf = (event: StoredObject) => {
  const start = String(event.start);
  const zone = event.showWithoutTime ? ZONE : ((event.timeZone as string | null) ?? ZONE);
  const minutes = Math.max(durationMinutes(event.duration as string | undefined), 0);
  return {
    utcStart: utc(fromLocal(start, zone)),
    utcEnd: utc(fromLocal(shiftLocal(start, minutes), zone)),
  };
};

const withTimes = (event: StoredObject): StoredObject => ({ ...event, ...timesOf(event) });

/** "jonas-event-4.20261102T073000": one date of a series, by the series and its start. */
const instanceId = (baseId: string, recurrenceId: string) =>
  `${baseId}.${recurrenceId.replace(/[-:]/g, "")}`;

const parseInstanceId = (id: string): { baseId: string; recurrenceId: string } | null => {
  const match = id.match(/^(.+)\.(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, baseId, y, mo, d, h, mi, s] = match;
  return { baseId: baseId!, recurrenceId: `${y}-${mo}-${d}T${h}:${mi}:${s}` };
};

const overridesOf = (event: StoredObject) => (event.recurrenceOverrides ?? {}) as Overrides;

/** One date of a series as its own event: the series, the date's start and its changes. */
const instanceOf = (base: StoredObject, recurrenceId: string): StoredObject => {
  const { recurrenceRule: _, recurrenceOverrides: __, ...own } = base;
  return withTimes({
    ...own,
    start: recurrenceId,
    ...overridesOf(base)[recurrenceId],
    id: instanceId(base.id, recurrenceId),
    recurrenceId,
    baseEventId: base.id,
  });
};

/** The dates of a series up to `last` (local), without the deleted ones. */
const instancesOf = (base: StoredObject, last: string): StoredObject[] => {
  const overrides = overridesOf(base);
  const rule = base.recurrenceRule as RecurrenceRule;
  return occurrences(String(base.start), rule, last)
    .filter((recurrenceId) => !overrides[recurrenceId]?.excluded)
    .map((recurrenceId) => instanceOf(base, recurrenceId));
};

const eventsOf = (store: Store, accountId: string) =>
  [...store.events.values()].filter((event) => event.accountId === accountId);

/** The event behind an id: a stored one, or one date of a series. */
export const findEvent = (store: Store, id: string): StoredObject | undefined => {
  const stored = store.events.get(id);
  if (stored) return withTimes(stored);
  const instance = parseInstanceId(id);
  const base = instance && store.events.get(instance.baseId);
  return base ? instanceOf(base, instance.recurrenceId) : undefined;
};

/** The events, and the dates of series, that overlap the instants (UTC). */
export const eventsBetween = (
  store: Store,
  accountId: string,
  after: string | undefined,
  before: string | undefined,
): StoredObject[] => {
  const last = before ? toLocal(new Date(before)) : "9999-12-31T00:00:00";
  return eventsOf(store, accountId)
    .flatMap((event) =>
      event.recurrenceRule ? instancesOf(event, shiftLocal(last, 1440)) : [withTimes(event)],
    )
    .filter(
      (event) =>
        (!after || String(event.utcEnd) > after) && (!before || String(event.utcStart) < before),
    );
};

const textOf = (event: StoredObject) =>
  [event.title, event.description, JSON.stringify(event.locations ?? {})].join(" ").toLowerCase();

const matches = (event: StoredObject, filter: Args) =>
  (!filter.inCalendar ||
    Boolean((event.calendarIds as Record<string, boolean>)?.[String(filter.inCalendar)])) &&
  (!filter.uid || event.uid === filter.uid) &&
  (!filter.text || textOf(event).includes(String(filter.text).toLowerCase()));

export const eventQuery = (store: Store, args: Args): Result => {
  const accountId = String(args.accountId);
  const filter = (args.filter ?? {}) as Args;
  const found = (
    args.expandRecurrences
      ? eventsBetween(store, accountId, filter.after as string, filter.before as string)
      : eventsOf(store, accountId).map(withTimes)
  )
    .filter((event) => matches(event, filter))
    .sort((a, b) => String(a.utcStart).localeCompare(String(b.utcStart)));
  const position = Number(args.position ?? 0);
  const limit = args.limit === undefined ? found.length : Number(args.limit);
  return {
    accountId,
    queryState: state(store),
    canCalculateChanges: false,
    position,
    ids: found.slice(position, position + limit).map((event) => event.id),
    total: found.length,
  };
};

/** With recurrenceOverridesAfter/Before, only the changed dates in that window. */
const overridesInWindow = (event: StoredObject, args: Args): StoredObject => {
  if (!args.recurrenceOverridesAfter && !args.recurrenceOverridesBefore) return event;
  const after = String(args.recurrenceOverridesAfter ?? "");
  const before = String(args.recurrenceOverridesBefore ?? "9999");
  const kept = Object.entries(overridesOf(event)).filter(([recurrenceId]) => {
    const instant = utc(fromLocal(recurrenceId, (event.timeZone as string | null) ?? ZONE));
    return instant >= after && instant < before;
  });
  return event.recurrenceOverrides
    ? { ...event, recurrenceOverrides: Object.fromEntries(kept) }
    : event;
};

export const eventGet = (store: Store, args: Args): Result => {
  const accountId = String(args.accountId);
  const ids =
    (args.ids as string[] | null | undefined) ?? eventsOf(store, accountId).map((e) => e.id);
  const found = ids.flatMap((id) => {
    const event = findEvent(store, id);
    return event?.accountId === accountId ? [overridesInWindow(event, args)] : [];
  });
  const properties = args.properties as string[] | undefined;
  return {
    accountId,
    state: state(store),
    list: found.map((event) =>
      properties
        ? Object.fromEntries(["id", ...properties].map((p) => [p, event[p] ?? null]))
        : event,
    ),
    notFound: ids.filter((id) => !found.some((event) => event.id === id)),
  };
};

// Scheduling

const bare = (address: unknown) =>
  typeof address === "string" ? address.replace(/^mailto:/i, "").toLowerCase() : "";

/** The colleagues' accounts among the attendees, other than the one the event is in. */
const attendeeAccounts = (store: Store, event: StoredObject): string[] =>
  Object.values((event.participants ?? {}) as Record<string, { calendarAddress?: string }>)
    .map((participant) => bare(participant.calendarAddress))
    .flatMap((email) => store.accounts.filter((a) => !a.isGroup && a.email === email))
    .map((account) => account.id)
    .filter((id) => id !== event.accountId);

const isOrganizer = (store: Store, event: StoredObject) => {
  const organizer = bare(event.organizerCalendarAddress);
  return !organizer || accountOf(store, event.accountId)?.email === organizer;
};

/** The same event in the other calendars of the company, by uid. */
const copiesOf = (store: Store, event: StoredObject) =>
  [...store.events.values()].filter(
    (other) => other.uid === event.uid && other.accountId !== event.accountId,
  );

/** Puts the event into the default calendar of each colleague who attends and lacks it. */
export const inviteColleagues = (store: Store, event: StoredObject) => {
  const present = new Set([event.accountId, ...copiesOf(store, event).map((e) => e.accountId)]);
  for (const accountId of attendeeAccounts(store, event)) {
    const calendar = defaultCollection(store, "calendar", accountId);
    if (present.has(accountId) || !calendar) continue;
    const id = newId(store, `${accountId}-event-`);
    store.events.set(id, { ...event, id, accountId, calendarIds: { [calendar.id]: true } });
  }
};

// CalendarEvent/set

/** Only what tells the event itself, not where it is filed. */
const sharedPatch = (patch: Args) =>
  Object.fromEntries(Object.entries(patch).filter(([path]) => !path.startsWith("calendarIds")));

/**
 * A change to one date of a series: the date as changed, minus what it has from the series,
 * becomes its entry in recurrenceOverrides.
 */
const updateInstance = (base: StoredObject, recurrenceId: string, patch: Args): StoredObject => {
  const before = instanceOf(base, recurrenceId);
  const after = applyPatch(before, patch);
  const own = Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) =>
        !["id", "recurrenceId", "baseEventId", "utcStart", "utcEnd"].includes(key) &&
        JSON.stringify(value) !== JSON.stringify(key === "start" ? recurrenceId : base[key]),
    ),
  );
  return { ...base, recurrenceOverrides: { ...overridesOf(base), [recurrenceId]: own } };
};

/** Changes the event, the series or one date of it; false when there is none. */
const updateOne = (store: Store, id: string, patch: Args): boolean => {
  const stored = store.events.get(id);
  if (stored) {
    store.events.set(id, applyPatch(stored, patch));
    return true;
  }
  const instance = parseInstanceId(id);
  const base = instance && store.events.get(instance.baseId);
  if (!instance || !base) return false;
  store.events.set(base.id, updateInstance(base, instance.recurrenceId, patch));
  return true;
};

/** The same date in a copy of the series. */
const counterpart = (copy: StoredObject, id: string) => {
  const instance = parseInstanceId(id);
  return instance ? instanceId(copy.id, instance.recurrenceId) : copy.id;
};

const destroyOne = (store: Store, id: string): boolean => {
  if (store.events.delete(id)) return true;
  const instance = parseInstanceId(id);
  const base = instance && store.events.get(instance.baseId);
  if (!instance || !base) return false;
  store.events.set(base.id, {
    ...base,
    recurrenceOverrides: { ...overridesOf(base), [instance.recurrenceId]: { excluded: true } },
  });
  return true;
};

export const eventSet = (store: Store, args: Args, created: Created): Result => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const id = newId(store, `${accountId}-event-`);
    const uid = (value.uid as string | undefined) ?? crypto.randomUUID();
    const event: StoredObject = { "@type": "Event", ...value, uid, id, accountId };
    store.events.set(id, event);
    inviteColleagues(store, event);
    created.set(key, id);
    createdOut[key] = { id, uid };
  }
  const updated: Result = {};
  const notUpdated: Result = {};
  for (const [id, patch] of Object.entries((args.update ?? {}) as Record<string, Args>)) {
    const before = findEvent(store, id);
    if (before?.accountId !== accountId || !updateOne(store, id, patch)) {
      notUpdated[id] = { type: "notFound" };
      continue;
    }
    for (const copy of copiesOf(store, before)) {
      updateOne(store, counterpart(copy, id), sharedPatch(patch));
    }
    const base = store.events.get(parseInstanceId(id)?.baseId ?? id);
    if (base) inviteColleagues(store, base);
    updated[id] = null;
  }
  const destroyed: string[] = [];
  for (const id of (args.destroy ?? []) as string[]) {
    const event = findEvent(store, id);
    if (event?.accountId !== accountId) continue;
    const copies = isOrganizer(store, event) ? copiesOf(store, event) : [];
    if (!destroyOne(store, id)) continue;
    for (const copy of copies) destroyOne(store, counterpart(copy, id));
    destroyed.push(id);
  }
  changed(store);
  return {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    destroyed,
    notCreated: {},
    notUpdated,
    notDestroyed: {},
  };
};

/**
 * CalendarEvent/parse for the invitations the demo itself sent: the event with the file's UID,
 * from whichever calendar holds it, stands for what the file says.
 */
export const eventParse = async (store: Store, args: Args): Promise<Result> => {
  const parsed: Record<string, StoredObject[]> = {};
  for (const blobId of (args.blobIds ?? []) as string[]) {
    const text = (await store.blobs.get(blobId)?.text()) ?? "";
    const uid = text.match(/^UID:(.+)$/m)?.[1]?.trim();
    const event = [...store.events.values()].find((candidate) => candidate.uid === uid);
    if (event) {
      const { id: _, accountId: __, calendarIds: ___, ...shown } = event;
      parsed[blobId] = [shown as StoredObject];
    }
  }
  return { accountId: args.accountId, parsed, notParsable: [], notFound: [] };
};
