/**
 * Stalwart's own notifications over JMAP: ShareNotification needs the principals capability,
 * CalendarEventNotification the calendars one (crates/jmap-proto/src/request/method.rs). Neither
 * can be created or changed; destroy dismisses (crates/jmap/src/*_notification/set.rs).
 */
import type { EventNotice, ShareNotice } from "@/lib/stalwart-notices";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = {
  ShareNotification: [CAPABILITIES.core, CAPABILITIES.principals],
  CalendarEventNotification: [CAPABILITIES.core, CAPABILITIES.calendars],
};

export type NoticeType = keyof typeof USING;

/** The last 30 days, newest first (crates/jmap/src/share_notification/get.rs). */
export const getShareNotices = async (client: JmapClient, accountId: string) =>
  (
    await client.call<{ list: ShareNotice[] }>(
      "ShareNotification/get",
      { accountId, ids: null },
      USING.ShareNotification,
    )
  ).list;

/** At most this many changed appointments per account, the newest. */
const NEWEST_CHANGES = 50;

/**
 * The newest that the person may see and has not dismissed, in the calendar's account, without
 * the new events: the bell leaves those out, so nobody dismisses them, and in a busy shared
 * calendar they pile up for 30 days (`expungeSchedulingInboxAfter`), past the 500 that a get
 * without ids answers (`maxGetResults`, all_ids in crates/jmap-proto/src/method/get.rs). The
 * query sees only the visible ones (crates/jmap/src/calendar_event_notification/query.rs).
 */
export const getEventNotices = async (
  client: JmapClient,
  accountId: string,
): Promise<EventNotice[]> => {
  const [, get] = await client.request(
    [
      [
        "CalendarEventNotification/query",
        {
          accountId,
          filter: { operator: "NOT", conditions: [{ type: "created" }] },
          sort: [{ property: "created", isAscending: false }],
          limit: NEWEST_CHANGES,
        },
        "q",
      ],
      [
        "CalendarEventNotification/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "CalendarEventNotification/query", path: "/ids" },
          properties: ["created", "changedBy", "type", "calendarEventId", "event", "eventPatch"],
        },
        "g",
      ],
    ],
    USING.CalendarEventNotification,
  );
  return (get![1].list ?? []) as EventNotice[];
};

export const dismissNotice = async (
  client: JmapClient,
  type: NoticeType,
  accountId: string,
  id: string,
): Promise<void> => {
  assertSetOk(
    await client.call(`${type}/set`, { accountId, destroy: [id] }, USING[type]),
    "Hinweis",
  );
};
