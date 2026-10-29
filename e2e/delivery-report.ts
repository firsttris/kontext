import { address, jmapAs } from "./helpers";

/** A delivery report (DSN, RFC 3464) from a server outside, as Postfix writes it. */
const reportMessage = (
  to: string,
  subject: string,
  recipients: { address: string; action: "delivered" | "failed"; diagnostic?: string }[],
) =>
  [
    "From: Mail Delivery System <MAILER-DAEMON@mx.example.test>",
    `To: <${to}>`,
    "Subject: Delivery Status Notification",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@mx.example.test>`,
    "Auto-Submitted: auto-replied",
    "MIME-Version: 1.0",
    'Content-Type: multipart/report; report-type=delivery-status; boundary="dsn"',
    "",
    "--dsn",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "This is the mail system at host mx.example.test.",
    "--dsn",
    "Content-Type: message/delivery-status",
    "",
    "Reporting-MTA: dns; mx.example.test",
    "Original-Envelope-Id: e2e-report",
    "",
    recipients
      .map((recipient) =>
        [
          `Final-Recipient: rfc822; ${recipient.address}`,
          `Action: ${recipient.action}`,
          `Status: ${recipient.action === "failed" ? "5.1.1" : "2.0.0"}`,
          ...(recipient.diagnostic ? [`Diagnostic-Code: smtp; ${recipient.diagnostic}`] : []),
        ].join("\r\n"),
      )
      .join("\r\n\r\n"),
    "",
    "--dsn",
    "Content-Type: text/rfc822-headers",
    "",
    `From: <${to}>`,
    `Subject: ${subject}`,
    "",
    "--dsn--",
    "",
  ].join("\r\n");

/**
 * Puts a report about a mail with this subject into the user's inbox (Email/import): the text
 * for people, the status per recipient and the headers of the mail it is about.
 */
export const deliverReport = async (
  user: string,
  {
    subject,
    recipients,
  }: {
    subject: string;
    recipients: { address: string; action: "delivered" | "failed"; diagnostic?: string }[];
  },
) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(([, a]) => a.name === address(user))![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  const raw = reportMessage(address(user), subject, recipients);
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const result = await client.call<{ created?: Record<string, unknown> }>("Email/import", {
    accountId,
    emails: { r: { blobId, mailboxIds: { [inbox]: true }, receivedAt: new Date().toISOString() } },
  });
  if (!result.created?.r) throw new Error(`Email/import: ${JSON.stringify(result)}`);
};
