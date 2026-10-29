/**
 * Invitations in mails: read the iCalendar part with Stalwart (CalendarEvent/parse), find the
 * event with the same UID in the calendar, answer, put it in, or take a called-off one out.
 * Answering writes the answer into the calendar without Stalwart's scheduling and sends the REPLY
 * to the organizer as a mail of its own (invitation-reply.ts says why).
 */

import { type ReplyStatus, replyMessage } from "@/lib/invitation-reply";
import { type CalendarEvent, participantEmail } from "@/lib/jscalendar";
import {
  importableEvent,
  mainEntry,
  myAttendee,
  organizerEmail,
  type ParsedEvent,
} from "@/lib/mail-invitation";
import { findRole } from "@/lib/mailboxes";
import { createEvent, deleteEvent, getStoredEvent, updateEvent } from "./calendar";
import { CAPABILITIES, type JmapClient } from "./client";
import { listMailboxes } from "./mail";
import { sendRaw } from "./send-raw";
import type { Identity } from "./types";

const USING = [CAPABILITIES.core, CAPABILITIES.calendars, CAPABILITIES.calendarsParse];
const QUIET = { sendSchedulingMessages: false };

/** The event of an iCalendar part of a mail; none when Stalwart cannot read it. */
export const parseInvitation = async (
  client: JmapClient,
  accountId: string,
  blobId: string,
): Promise<ParsedEvent | null> => {
  const { parsed } = await client.call<{ parsed?: Record<string, ParsedEvent[]> }>(
    "CalendarEvent/parse",
    { accountId, blobIds: [blobId] },
    USING,
  );
  return mainEntry(parsed?.[blobId] ?? []) ?? null;
};

/** The stored event (the series, not a date of it) with that UID in the account, if any. */
export const findEventByUid = async (
  client: JmapClient,
  accountId: string,
  uid: string,
): Promise<CalendarEvent | null> => {
  const { ids } = await client.call<{ ids: string[] }>(
    "CalendarEvent/query",
    { accountId, filter: { uid } },
    USING,
  );
  return ids[0] ? getStoredEvent(client, accountId, ids[0]) : null;
};

/** Puts the event into the calendar as it came, without answering. */
export const addInvitation = (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  parsed: ParsedEvent,
): Promise<string> =>
  createEvent(client, accountId, calendarId, importableEvent(parsed, []), QUIET);

/**
 * Takes what the organizer called off out of the calendar: one date of a series (a CANCEL with
 * RECURRENCE-ID) as an exclusion, else the whole event. The overrides go as a whole map: Stalwart
 * refuses a patch path into overrides that are not there yet.
 */
export const removeCancelled = (
  client: JmapClient,
  accountId: string,
  stored: CalendarEvent,
  parsed: ParsedEvent,
) =>
  parsed.recurrenceId
    ? updateEvent(
        client,
        accountId,
        stored.id,
        {
          recurrenceOverrides: {
            ...stored.recurrenceOverrides,
            [parsed.recurrenceId]: { excluded: true },
          },
        },
        QUIET,
      )
    : deleteEvent(client, accountId, stored.id, QUIET);

/**
 * The mail carries a later version of the whole event (a higher SEQUENCE) than the calendar: the
 * organizer moved or changed it. A changed date of a series alone is no new version of the series.
 */
const isNewerVersion = (parsed: ParsedEvent, stored: CalendarEvent) =>
  !parsed.recurrenceId && (parsed.sequence ?? 0) > (stored.sequence ?? 0);

/** An event as a patch for the stored one: what says which event and where it lives stays. */
const withoutIdentity = ({
  uid: _uid,
  calendarIds: _calendarIds,
  "@type": _type,
  ...rest
}: Record<string, unknown>) => rest;

/**
 * Answers: the answer goes into the event in the calendar (put in first if it is not there yet,
 * brought up to the mail's version if that is newer),
 * then the REPLY to the organizer, from the identity with the user's address among the attendees.
 */
export const answerInvitation = async (
  client: JmapClient,
  {
    accountId,
    calendarId,
    parsed,
    stored,
    status,
    identities,
    now = new Date(),
  }: {
    accountId: string;
    calendarId: string;
    parsed: ParsedEvent;
    stored: CalendarEvent | null;
    status: ReplyStatus;
    identities: Identity[];
    now?: Date;
  },
): Promise<void> => {
  const addresses = identities.map((identity) => identity.email);
  const newer = Boolean(stored && isNewerVersion(parsed, stored));
  const event = stored && !newer ? stored : parsed;
  const me = myAttendee(event, addresses);
  const myEmail = me ? participantEmail(me[1]).toLowerCase() : "";
  const sender = identities.find((identity) => identity.email.toLowerCase() === myEmail);
  if (!me || !sender) throw new Error("Du stehst nicht unter den Eingeladenen.");
  if (stored) {
    await updateEvent(
      client,
      accountId,
      stored.id,
      newer
        ? withoutIdentity(importableEvent(parsed, addresses, status))
        : { [`participants/${me[0]}/participationStatus`]: status },
      QUIET,
    );
  } else {
    await createEvent(
      client,
      accountId,
      calendarId,
      importableEvent(parsed, addresses, status),
      QUIET,
    );
  }
  const organizer = organizerEmail(event);
  // RSVP=FALSE: the organizer asked for no answer.
  if (!organizer || me[1].expectReply === false) return;
  const organizerName =
    Object.values(event.participants ?? {}).find(
      (participant) => participantEmail(participant).toLowerCase() === organizer,
    )?.name ?? null;
  const mailboxes = await listMailboxes(client, accountId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");
  if (!drafts || !sent) throw new Error("Postfach ohne Entwürfe oder Gesendet");
  await sendRaw(client, {
    accountId,
    raw: replyMessage({
      event,
      attendee: { name: sender.name || me[1].name || null, email: sender.email },
      organizer: { name: organizerName, email: organizer },
      status,
      now,
      id: crypto.randomUUID(),
    }),
    identityId: sender.id,
    from: sender.email,
    recipients: [organizer],
    draftsId: drafts.id,
    sentId: sent.id,
  });
};
