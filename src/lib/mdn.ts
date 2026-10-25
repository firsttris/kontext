/**
 * Read receipts (RFC 8098): the confirmation a mail was displayed, as the raw message Kontext
 * sends – a multipart/report with a line for people and the machine-readable part – and how one
 * is recognised. Stalwart has no JMAP MDN (RFC 9007), so the app builds it. Pure.
 */

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

const mailbox = (address: { name: string | null; email: string }) =>
  address.name ? `${word(address.name)} <${address.email}>` : `<${address.email}>`;

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
  const when = new Date(original.sentAt).toLocaleString("de-DE", {
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
