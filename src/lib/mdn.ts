/**
 * Read receipts (RFC 8098): the confirmation a mail was displayed, as the raw message Kontext
 * sends – a multipart/report with a line for people and the machine-readable part – and how one
 * is recognised. Stalwart has no JMAP MDN (RFC 9007), so the app builds it. Pure.
 */

import type { BodyStructure } from "@/jmap/types";
import { fieldGroups, findPart, withoutType } from "./dsn";
import { LOCALE } from "./locale";
import { mailbox } from "./mime";

/** Set on a mail once its receipt was sent or declined (RFC 3503), so nobody is asked twice. */
export const MDN_SENT = "$MDNSent";

/** UTF-8 as base64, in the browser as on the server. */
const base64 = (text: string) => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** "=?UTF-8?B?…?=" for a header with more than ASCII (RFC 2047). */
const word = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(text)}?=`);

const base64Lines = (text: string) => (base64(text).match(/.{1,76}/g) ?? []).join("\r\n");

export type ReceiptInput = {
  from: { name: string | null; email: string };
  to: { name: string | null; email: string };
  /** The mail read: its Message-ID (without brackets), subject and when it was sent. */
  original: { messageId: string; subject: string; sentAt: string };
  now: Date;
  /** For the Message-ID of the receipt. */
  id: string;
};

export const receiptMessage = ({ from, to, original, now, id }: ReceiptInput): string => {
  const boundary = `kontext-mdn-${id}`;
  const domain = from.email.split("@")[1] ?? "kontext.local";
  const when = new Date(original.sentAt).toLocaleString(LOCALE, {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const human = [
    `Ihre Nachricht „${original.subject}“ vom ${when}`,
    `wurde von ${from.name ? `${from.name} <${from.email}>` : from.email} geöffnet.`,
    "",
    "Das sagt nur, dass sie angezeigt wurde – nicht, dass sie gelesen oder verstanden wurde.",
  ].join("\r\n");
  return [
    `From: ${mailbox(from)}`,
    `To: ${mailbox(to)}`,
    `Subject: ${word(`Gelesen: ${original.subject}`)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    `In-Reply-To: <${original.messageId}>`,
    `References: <${original.messageId}>`,
    "Auto-Submitted: auto-replied",
    "MIME-Version: 1.0",
    `Content-Type: multipart/report; report-type=disposition-notification; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(human),
    `--${boundary}`,
    "Content-Type: message/disposition-notification",
    "",
    "Reporting-UA: Kontext",
    `Final-Recipient: rfc822;${from.email}`,
    `Original-Message-ID: <${original.messageId}>`,
    "Disposition: manual-action/MDN-sent-manually; displayed",
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

/** Whether the receipt was answered; keywords are without case (Stalwart gives "$mdnsent"). */
export const receiptAnswered = (keywords: Record<string, boolean>): boolean =>
  Object.keys(keywords).some((keyword) => keyword.toLowerCase() === MDN_SENT.toLowerCase());

/** Whether a mail is a read receipt, by its Content-Type header. */
export const isReceipt = (contentType: string | null | undefined): boolean =>
  /multipart\/report/i.test(contentType ?? "") &&
  /report-type\s*=\s*"?disposition-notification/i.test(contentType ?? "");

const DISPOSITION_TYPES = [
  "message/disposition-notification",
  "message/global-disposition-notification",
];

/** The machine-readable part of a receipt (RFC 8098 §3.1, RFC 6533 for the global one). */
export const dispositionPart = (structure: BodyStructure | null): BodyStructure | null =>
  findPart(structure, (part) => DISPOSITION_TYPES.includes(part.type.toLowerCase()));

export type Disposition = {
  /** The Message-ID of the mail the receipt is for, without brackets. */
  originalMessageId: string | null;
  /** Who displayed it (Final-Recipient without its type). */
  finalRecipient: string | null;
};

/** "<a@b>" → "a@b"; JMAP gives Message-IDs without the brackets (RFC 8621 §4.1.2.5). */
export const bareMessageId = (value: string): string | null =>
  /<([^<>\s]+)>/.exec(value)?.[1] ?? (/^[^<>\s]+$/.test(value.trim()) ? value.trim() : null);

/** The message/disposition-notification part read (RFC 8098 §3.2). */
export const parseDisposition = (text: string): Disposition => {
  const fields = new Map(fieldGroups(text).flatMap((group) => [...group]));
  const original = fields.get("original-message-id");
  return {
    originalMessageId: original ? bareMessageId(original) : null,
    finalRecipient: withoutType(fields.get("final-recipient")),
  };
};

/**
 * The Message-IDs a receipt names as the mail it confirms: In-Reply-To and References as the
 * receipt's own headers carry them, and the report's Original-Message-ID (some programs set only
 * that one).
 */
export const receiptTargets = (
  mail: { inReplyTo: string[] | null; references: string[] | null },
  originalMessageId: string | null,
): string[] => [
  ...new Set([
    ...(mail.inReplyTo ?? []),
    ...(mail.references ?? []),
    ...(originalMessageId ? [originalMessageId] : []),
  ]),
];

/** A sent mail as far as receipts care: its Message-ID and whether it asked for one. */
export type SentMail = { messageId: string[] | null; receiptTo: unknown[] | null };

/**
 * The receipts that confirm one of these sent mails, which asked for a receipt; only those are
 * filed away. A receipt for anything else – or a mail that only looks like one – stays.
 */
export const receiptsForSent = <R extends { targets: string[] }>(
  receipts: R[],
  sent: SentMail[],
): R[] => {
  const asked = new Set(
    sent.filter((mail) => mail.receiptTo?.length).flatMap((mail) => mail.messageId ?? []),
  );
  return receipts.filter((receipt) => receipt.targets.some((id) => asked.has(id)));
};
