/**
 * What the bell shows and what the device announces, derived from the server's state: unread mail
 * in the inboxes, invitations waiting for an answer, today's next appointments. Nothing is stored
 * on the server; "seen" is only the moment the bell was last opened on this device.
 */
import type { EmailSummary } from "@/jmap/types";

/** Unread mail of the last days counts as new; older unread mail is not news any more. */
export const NEW_MAIL_DAYS = 3;

export type InboxMail = { accountId: string; label: string; email: EmailSummary };

export const newMails = (mails: InboxMail[], now: Date): InboxMail[] =>
  mails
    .filter(
      ({ email }) =>
        !email.keywords.$seen &&
        now.getTime() - Date.parse(email.receivedAt) <= NEW_MAIL_DAYS * 86_400_000,
    )
    .sort((a, b) => Date.parse(b.email.receivedAt) - Date.parse(a.email.receivedAt));

export type Appointment = { key: string; title: string; start: Date; end: Date };

/** Today's appointments that have not ended yet, the next first. */
export const restOfToday = <T extends Appointment>(events: T[], now: Date, today: string): T[] =>
  events
    .filter((event) => event.end > now && dayOf(event.start) === today)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

const berlinDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
const dayOf = (date: Date) => berlinDay.format(date);

/** How many entries arrived since the bell was last opened (`seen`, ms). */
export const unseenCount = (times: Date[], seen: number): number =>
  times.filter((time) => time.getTime() > seen).length;

/** Mails to announce on the device: new since the last look, not announced before, oldest first. */
export const mailsToAnnounce = (
  mails: InboxMail[],
  since: number,
  announced: Set<string>,
): InboxMail[] =>
  mails
    .filter(
      ({ accountId, email }) =>
        Date.parse(email.receivedAt) > since && !announced.has(`${accountId}/${email.id}`),
    )
    .reverse();
