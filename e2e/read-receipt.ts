/**
 * Mails for the read-receipt tests, put straight into a mailbox (Email/import): a sent mail that
 * asked for a receipt, and a receipt as some programs send it – another subject, no In-Reply-To,
 * the mail named only in the report's Original-Message-ID (RFC 8098 §3.2.5).
 */
import { address, jmapAs, mailboxAccountId } from "./helpers";

const importInto = async (
  user: string,
  role: string,
  raw: string,
  { receivedAt, seen }: { receivedAt: Date; seen: boolean },
) => {
  const client = jmapAs(user);
  const accountId = await mailboxAccountId(user, user);
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const folder = list.find((box) => box.role === role)!.id;
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const result = await client.call<{ created?: Record<string, unknown> }>("Email/import", {
    accountId,
    emails: {
      r: {
        blobId,
        mailboxIds: { [folder]: true },
        keywords: seen ? { $seen: true } : {},
        receivedAt: receivedAt.toISOString(),
      },
    },
  });
  if (!result.created?.r) throw new Error(`Email/import: ${JSON.stringify(result)}`);
};

const date = (when: Date) => when.toUTCString().replace("GMT", "+0000");

/** A mail in the user's Sent to `to`, asking for a read receipt. */
export const sentAskingReceipt = (
  user: string,
  { messageId, subject, to, at }: { messageId: string; subject: string; to: string; at: Date },
) =>
  importInto(
    user,
    "sent",
    [
      `From: <${address(user)}>`,
      `To: Petra Keller <${to}>`,
      `Subject: ${subject}`,
      `Date: ${date(at)}`,
      `Message-ID: <${messageId}>`,
      `Disposition-Notification-To: <${address(user)}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Bitte bis Freitag freigeben.",
      "",
    ].join("\r\n"),
    { receivedAt: at, seen: true },
  );

/** An unread receipt in the user's inbox that names `original` only in its report. */
export const receiptInInbox = (
  user: string,
  { from, subject, original }: { from: string; subject: string; original: string },
) =>
  importInto(
    user,
    "inbox",
    [
      `From: Petra Keller <${from}>`,
      `To: <${address(user)}>`,
      `Subject: ${subject}`,
      `Date: ${date(new Date())}`,
      `Message-ID: <receipt.${Date.now()}.${Math.random().toString(36).slice(2)}@keller-elektro.test>`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/report; report-type=disposition-notification; boundary="mdn"',
      "",
      "--mdn",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Ihre Nachricht wurde angezeigt.",
      "--mdn",
      "Content-Type: message/disposition-notification",
      "",
      "Reporting-UA: Outlook",
      `Final-Recipient: rfc822;${from}`,
      `Original-Message-ID: <${original}>`,
      "Disposition: manual-action/MDN-sent-manually; displayed",
      "",
      "--mdn--",
      "",
    ].join("\r\n"),
    { receivedAt: new Date(), seen: false },
  );
