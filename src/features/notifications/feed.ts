/**
 * The entries of the bell: new mail in all inboxes (own and shared), invitations waiting for an
 * answer, the rest of today's appointments, tasks given to me lately and those due today or
 * before. All from the server's state, refreshed by push like every other view, so reading a
 * mail on the phone clears it here too.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { queryEmails } from "@/jmap/mail";
import { addDays, type CalendarEvent, dateKey, eventKey, eventTimes } from "@/lib/jscalendar";
import { shortAddress } from "@/lib/mail-accounts";
import { type InboxMail, newMails, restOfToday } from "@/lib/notifications";
import { assignedToMe, dueTasks } from "@/lib/task-context";
import { isInvitation, useEvents, useMyAddresses } from "../calendar/queries";
import { useInboxes } from "../mail/queries";
import { useMe, useTasks } from "../tasks/queries";

export type FeedEvent = {
  key: string;
  title: string;
  start: Date;
  end: Date;
  event: CalendarEvent;
};

const asFeedEvent = (event: CalendarEvent): FeedEvent => {
  const { start, end } = eventTimes(event);
  return { key: eventKey(event), title: event.title ?? "", start, end, event };
};

export const useNotificationFeed = (now: Date) => {
  const client = useClient();
  const inboxes = useInboxes();
  const unread = useQueries({
    queries: inboxes.map(({ account, mailbox }) => ({
      // Under the account's "emails" key, so moving or reading a mail refreshes it.
      queryKey: [account.id, "emails", "unread-inbox", mailbox.id],
      queryFn: () =>
        queryEmails(client, account.id, { mailboxId: mailbox.id, unreadOnly: true }, 0, 20),
    })),
  });
  const mails: InboxMail[] = newMails(
    inboxes.flatMap(({ account }, index) =>
      (unread[index]?.data?.emails ?? []).map((email) => ({
        accountId: account.id,
        label: account.isPersonal ? "" : shortAddress(account.name),
        email,
      })),
    ),
    now,
  );

  const today = dateKey(now);
  const { data: events, calendars } = useEvents(today, addDays(today, 60));
  const mine = useMyAddresses();
  const invitations = events
    .filter((event) => isInvitation(calendars, event, mine))
    .map(asFeedEvent)
    .filter((event) => event.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const invited = new Set(invitations.map((event) => event.key));
  const appointments = restOfToday(
    events.filter((event) => !invited.has(eventKey(event))).map(asFeedEvent),
    now,
    today,
  );

  const me = useMe();
  const { tasks } = useTasks();
  const assigned = assignedToMe(tasks, me, now);
  const given = new Set(assigned.map((task) => task.id));
  const due = dueTasks(tasks, me, today).filter((task) => !given.has(task.id));
  return { mails, invitations, appointments, assigned, due };
};
