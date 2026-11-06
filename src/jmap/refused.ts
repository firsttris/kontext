/**
 * A mail the server took but sent to no one. When the server refuses every recipient at RCPT TO
 * (an address that does not exist, its sending limit: "452 4.4.5 Rate limit exceeded"),
 * EmailSubmission/set still succeeds. Stalwart then queues nothing and answers "final" at once
 * (crates/jmap/src/submission/set.rs), and onSuccessUpdateEmail has already moved the mail to
 * Sent. Unchecked, it would read as sent – or as scheduled – and never go out.
 */
import { CAPABILITIES, type JmapClient, jmapError } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission];

/** RFC 8621 §7: per recipient, the server's SMTP reply. */
export type DeliveryStatus = Record<string, { smtpReply: string }>;

export type Refusal = { email: string; reply: string };

/** The recipients, with their replies, when every one was refused (4xx or 5xx); else none. */
export const refusedByAll = (status: DeliveryStatus | null | undefined): Refusal[] => {
  const replies = Object.entries(status ?? {}).map(([email, { smtpReply }]) => ({
    email,
    reply: smtpReply.trim(),
  }));
  return replies.length && replies.every(({ reply }) => /^[45]/.test(reply)) ? replies : [];
};

/** `draftId`: the mail as the draft it is again (the one it replaced is gone), or null. */
export type RefusedError = Error & {
  type: "recipientsRefused";
  refused: Refusal[];
  draftId: string | null;
};

export const isRefusedError = (error: unknown): error is RefusedError =>
  error instanceof Error && (error as { type?: string }).type === "recipientsRefused";

/**
 * After a submission: when no recipient was taken, the mail goes back to `draftsId` (or away,
 * with `draftsId` null: an encrypted mail is no draft) and a RefusedError is thrown.
 */
export const assertAccepted = async (
  client: JmapClient,
  accountId: string,
  submission: { id: string; undoStatus?: string } | undefined,
  emailId: string,
  draftsId: string | null,
): Promise<void> => {
  // Anything queued is "pending" (held or on its way); only "final" right away can be a refusal.
  if (submission?.undoStatus !== "final") return;
  const [got] = await client.request(
    [
      [
        "EmailSubmission/get",
        { accountId, ids: [submission.id], properties: ["deliveryStatus"] },
        "0",
      ],
    ],
    USING,
  );
  const [status] = (got![1].list ?? []) as { deliveryStatus?: DeliveryStatus | null }[];
  const refused = refusedByAll(status?.deliveryStatus);
  if (!refused.length) return;
  await client.request(
    [
      [
        "Email/set",
        draftsId
          ? {
              accountId,
              update: { [emailId]: { mailboxIds: { [draftsId]: true }, "keywords/$draft": true } },
            }
          : { accountId, destroy: [emailId] },
        "0",
      ],
    ],
    USING,
  );
  throw Object.assign(
    jmapError(
      refused.map(({ email, reply }) => `${email}: ${reply}`).join(", "),
      "recipientsRefused",
    ),
    { refused, draftId: draftsId ? emailId : null },
  );
};
