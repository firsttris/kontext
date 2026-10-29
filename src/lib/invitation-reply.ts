/**
 * The answer to an invitation from someone else (iTIP REPLY, RFC 5546 §3.2.3; iMIP, RFC 6047),
 * sent by Kontext to the organizer. Stalwart does not send it for these: an event the attendee put
 * into the calendar over JMAP has no schedule tag, and without one an update counts as a new
 * event, which only an organizer may send for (`itip_create` / `itip_update` in
 * crates/jmap/src/calendar_event/set.rs). Outlook, Gmail and Apple enter the answer into the
 * organizer's event; Stalwart does so too (crates/email/src/message/ingest.rs). Pure.
 */
import { m } from "@/paraglide/messages";
import { fold, paramValue, utcStamp, writeText } from "./ical-text";
import { organizerLine, PARTSTAT } from "./itip";
import type { CalendarEvent } from "./jscalendar";
import { type MimeAddress, multipart, textPart, withHeaders } from "./mime";

export type ReplyStatus = "accepted" | "declined" | "tentative";

/**
 * The REPLY: who answers what to which event. DTSTART and the rest may be left out (§3.2.3); the
 * organizer's program finds the event by its UID.
 */
export const replyICalendar = (
  event: CalendarEvent,
  attendee: MimeAddress,
  status: ReplyStatus,
  now: Date,
): string => {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Kontext//Kalender//DE",
    "VERSION:2.0",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    `UID:${event.uid ?? event.id}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(event.title ? [`SUMMARY:${writeText(event.title)}`] : []),
    organizerLine(event),
    `ATTENDEE;${attendee.name ? `CN=${paramValue(attendee.name)};` : ""}PARTSTAT=${PARTSTAT[status]}:mailto:${attendee.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
};

const SUBJECT: Record<ReplyStatus, (title: string) => string> = {
  accepted: (title) => m.invitation_reply_subject_accepted({ title }),
  tentative: (title) => m.invitation_reply_subject_tentative({ title }),
  declined: (title) => m.invitation_reply_subject_declined({ title }),
};

const TEXT: Record<ReplyStatus, (name: string) => string> = {
  accepted: (name) => m.invitation_reply_text_accepted({ name }),
  tentative: (name) => m.invitation_reply_text_tentative({ name }),
  declined: (name) => m.invitation_reply_text_declined({ name }),
};

export type ReplyMail = {
  event: CalendarEvent;
  attendee: MimeAddress;
  organizer: MimeAddress;
  status: ReplyStatus;
  now: Date;
  /** Unique; goes into the Message-ID and the MIME boundary. */
  id: string;
};

/** The whole mail, as Outlook sends an answer: a line of text and the REPLY beside it. */
export const replyMessage = (mail: ReplyMail): string => {
  const title = mail.event.title || m.invitation_untitled();
  const ics = replyICalendar(mail.event, mail.attendee, mail.status, mail.now);
  const body = multipart("alternative", `reply-${mail.id}`, [
    textPart(
      "text/plain",
      `${TEXT[mail.status](mail.attendee.name || mail.attendee.email)}\r\n\r\n${title}\r\n`,
    ),
    textPart("text/calendar; method=REPLY", ics),
  ]);
  return withHeaders(
    {
      from: mail.attendee,
      to: [mail.organizer],
      cc: [],
      subject: SUBJECT[mail.status](title),
      date: mail.now,
      messageId: `${mail.id}@${mail.attendee.email.split("@")[1] ?? "kontext"}`,
    },
    body,
  );
};
