/**
 * Stalwart's notifications for the bell: shares with me (my own account) and changes others made
 * to events in calendars I see (in each calendar's account). Under the account's key, so push
 * (a ShareNotification or CalendarEventNotification state change) refreshes them.
 */
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import {
  dismissNotice,
  getEventNotices,
  getShareNotices,
  type NoticeType,
} from "@/jmap/notifications";
import { eventChange, isShownShare } from "@/lib/stalwart-notices";
import { useCalendarRefs } from "../calendar/queries";

const SHARES = "share-notices";
const EVENTS = "event-notices";

export const useStalwartNotices = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const own = session?.primaryAccounts[CAPABILITIES.principals];
  const { calendars } = useCalendarRefs();
  const accounts = [...new Set(calendars.map((calendar) => calendar.accountId))];

  const shares = useQuery({
    queryKey: [own, SHARES],
    queryFn: () => getShareNotices(client, own!),
    enabled: Boolean(own),
  });
  const events = useQueries({
    queries: accounts.map((accountId) => ({
      queryKey: [accountId, EVENTS],
      queryFn: () => getEventNotices(client, accountId),
    })),
  });

  const shared = (shares.data ?? [])
    .filter(isShownShare)
    .map((notice) => ({ accountId: own!, notice }));
  const changed = accounts.flatMap((accountId, index) =>
    (events[index]?.data ?? []).flatMap((notice) => {
      const change = eventChange(notice);
      return change ? [{ accountId, notice, change }] : [];
    }),
  );

  /** Gone here at once; the destroy clears it on every device. */
  const dismiss = (type: NoticeType, accountId: string, id: string) => {
    const key = [accountId, type === "ShareNotification" ? SHARES : EVENTS];
    queryClient.setQueryData<{ id: string }[]>(key, (list) => list?.filter((n) => n.id !== id));
    // Failed or not, the server's list again: a failed one comes back.
    const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
    void dismissNotice(client, type, accountId, id).then(refresh, refresh);
  };

  return { shared, changed, calendars, dismiss };
};
