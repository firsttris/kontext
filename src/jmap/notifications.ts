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

/** Those the person may see and has not dismissed, in the calendar's account. */
export const getEventNotices = async (client: JmapClient, accountId: string) =>
  (
    await client.call<{ list: EventNotice[] }>(
      "CalendarEventNotification/get",
      {
        accountId,
        ids: null,
        properties: ["created", "changedBy", "type", "calendarEventId", "event", "eventPatch"],
      },
      USING.CalendarEventNotification,
    )
  ).list;

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
