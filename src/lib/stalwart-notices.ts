/**
 * What Stalwart itself tells a person, shown in the bell. A ShareNotification (RFC 9670, JMAP
 * Sharing) is written into the grantee's account whenever an owner grants or revokes rights on a
 * calendar, an address book or a mail folder (crates/common/src/storage/index/build.rs, `log_share_notification`); Stalwart keeps
 * them 30 days (`expungeShareNotifyAfter`). A CalendarEventNotification (draft-ietf-jmap-calendars)
 * lives in the calendar's account when someone else changed an event there, or an organizer's
 * update came in (crates/groupware/src/calendar/storage.rs, itip.rs); only others see it
 * (`can_view` in crates/groupware/src/calendar/notification.rs). Destroying either clears it for
 * the person only (crates/jmap/src/{share,calendar_event}_notification/set.rs).
 */
import { ACCOUNT_NAME } from "../../server/stalwart-setup";
import type { CalendarEvent } from "./jscalendar";

type Person = { name: string; email?: string | null };

export type ShareNotice = {
  id: string;
  created: string;
  changedBy: Person;
  /** The shared object's JMAP type: "Calendar", "AddressBook", … */
  objectType: string | null;
  objectAccountId: string;
  objectId: string;
  /** The rights before and now, each true or false; all false now when the share was revoked. */
  oldRights: Record<string, boolean> | null;
  newRights: Record<string, boolean> | null;
};

export type EventNotice = {
  id: string;
  created: string;
  changedBy: Person | null;
  type: "created" | "updated" | "destroyed";
  calendarEventId: string | null;
  /** The event before the change (crates/jmap/src/calendar_event_notification/get.rs). */
  event: CalendarEvent | null;
  /** From that event to the one now, as a JMAP patch. */
  eventPatch: Record<string, unknown> | null;
};

export type EventChange = "moved" | "changed" | "cancelled";

/** Properties whose change moves the event in time. */
const TIME_KEYS = new Set(["start", "duration", "timeZone", "showWithoutTime", "recurrenceRule"]);
/**
 * What changes with every save (Stalwart's patch counts `sequence` up) or with an answer, without
 * the event changing for the reader.
 */
const NOT_A_CHANGE = new Set(["sequence", "updated", "created", "participants"]);

/**
 * Whether Kontext's server made the change, as it does for subscribed calendars
 * (server/subscriptions/calendars.ts): with its key that is the account `kontext-server@…`
 * (server/stalwart-setup.ts), in development the admin, who has no address like no person has.
 * Stalwart names an outside organizer by address (`ChangedBy::CalendarAddress`).
 */
const byKontextServer = (person: Person | null): boolean =>
  person !== null && (!person.email || person.email.split("@")[0] === ACCOUNT_NAME);

/**
 * What the bell says of the change, or null for what it leaves out: new events (an invitation
 * already stands under "Invitations"), answers of participants (they arrive as mail) and the
 * server's syncs of subscribed calendars.
 */
export const eventChange = (notice: EventNotice): EventChange | null => {
  if (byKontextServer(notice.changedBy)) return null;
  if (notice.type === "destroyed") return "cancelled";
  if (notice.type !== "updated") return null;
  const patch = notice.eventPatch ?? {};
  if (patch.status === "cancelled") return "cancelled";
  const keys = Object.keys(patch).map((key) => key.split("/")[0]!);
  if (keys.some((key) => TIME_KEYS.has(key))) return "moved";
  return keys.every((key) => NOT_A_CHANGE.has(key)) ? null : "changed";
};

/** The event as it is now: the snapshot before the change with the patch's whole properties. */
export const eventNow = (notice: EventNotice): CalendarEvent | null => {
  if (!notice.event) return null;
  const whole = Object.entries(notice.eventPatch ?? {}).filter(([key]) => !key.includes("/"));
  return { ...notice.event, ...Object.fromEntries(whole) };
};

/** The right that lets one see the contents, per shared type (crates/jmap-proto/src/object/). */
const READ_RIGHT: Partial<Record<string, string>> = {
  Calendar: "mayReadItems",
  AddressBook: "mayRead",
};

const mayRead = (notice: ShareNotice, rights: ShareNotice["newRights"]) =>
  Boolean(rights?.[READ_RIGHT[notice.objectType ?? ""] ?? ""]);

/**
 * Only a calendar or address book one may now read, or no longer may. Left out: free and busy
 * times alone, which Kontext's server shares with every colleague (server/company/availability.ts),
 * other changes of rights, and mail folders, as a deputy gets one per folder (lib/deputy.ts).
 */
export const isShownShare = (notice: ShareNotice): boolean =>
  notice.objectType !== null &&
  notice.objectType in READ_RIGHT &&
  mayRead(notice, notice.oldRights) !== mayRead(notice, notice.newRights);

export const isGranted = (notice: ShareNotice): boolean => mayRead(notice, notice.newRights);
