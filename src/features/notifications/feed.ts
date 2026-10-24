/**
 * The entries of the bell: new mail in all inboxes (own and shared), invitations waiting for an
 * answer, the rest of today's appointments. All from the server's state, refreshed by push like
 * every other view, so reading a mail on the phone clears it here too.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { queryEmails } from "@/jmap/mail";
import { addDays, type CalendarEvent, dateKey, eventKey, eventTimes } from "@/lib/jscalendar";
import { shortAddress } from "@/lib/mail-accounts";
import { type InboxMail, newMails, restOfToday } from "@/lib/notifications";
import { isInvitation, useEvents, useMyAddresses } from "../calendar/queries";
import { useInboxes } from "../mail/queries";

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
  return { mails, invitations, appointments };
};
