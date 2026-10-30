/**
 * The badges on the apps in the tab bar and the rail: where a push notification's news waits.
 * Mail counts like "Alle Posteingänge" and the app icon; invitations and tasks come from the
 * bell's feed. Reading the mail, answering the invitation or opening the tasks clears them on
 * every device.
 */
import { useEffect } from "react";
import { useChannels } from "@/features/chat/queries";
import { totalUnread } from "@/lib/chat";
import { type AppBadges, appBadges, invitationsSoon } from "@/lib/notifications";
import { assignedToMe } from "@/lib/task-context";
import { useInboxes } from "../mail/queries";
import { useMe, useTasks } from "../tasks/queries";
import { markTasksSeen, useSeen } from "./device-settings";
import { useNotificationFeed, useNow } from "./feed";

export const useAppBadges = (): AppBadges => {
  const now = useNow();
  const { invitations, assigned } = useNotificationFeed(now);
  const inboxes = useInboxes();
  const seen = useSeen();
  return appBadges({
    mails: inboxes.reduce((sum, { mailbox }) => sum + mailbox.unreadEmails, 0),
    invitations: invitationsSoon(invitations, now).length,
    newTasks: assigned.filter((task) => !seen.tasks.includes(task.id)).length,
    chat: totalUnread(useChannels().channels),
  });
};

/** On the tasks page: the tasks given to me are in front of me now, their badge goes. */
export const useAssignedTasksSeen = () => {
  const me = useMe();
  const { tasks } = useTasks();
  // A string, so the effect runs when the set of tasks changes, not on every render.
  const ids = assignedToMe(tasks, me, new Date())
    .map((task) => task.id)
    .join(" ");
  useEffect(() => {
    if (ids) markTasksSeen(ids.split(" "));
  }, [ids]);
};
