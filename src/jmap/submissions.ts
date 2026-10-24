/**
 * Mails on their way (RFC 8621 §7): those the server still holds – the seconds for "Rückgängig",
 * or scheduled for later – and taking one back while it is held.
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";
import { SUMMARY_PROPERTIES } from "./mail";
import type { EmailSummary } from "./types";

const USING = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission];

export type HeldMail = {
  submissionId: string;
  emailId: string;
  sendAt: string;
  email: EmailSummary | undefined;
};

/** What the server still holds, the next first, with the mails themselves. */
export const heldMails = async (client: JmapClient, accountId: string): Promise<HeldMail[]> => {
  const [, get, got] = await client.request(
    [
      ["EmailSubmission/query", { accountId, filter: { undoStatus: "pending" } }, "q"],
      [
        "EmailSubmission/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "EmailSubmission/query", path: "/ids" },
          properties: ["emailId", "sendAt", "undoStatus"],
        },
        "g",
      ],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "g", name: "EmailSubmission/get", path: "/list/*/emailId" },
          properties: SUMMARY_PROPERTIES,
        },
        "e",
      ],
    ],
    USING,
  );
  const emails = new Map(
    ((got![1].list as EmailSummary[]) ?? []).map((email) => [email.id, email]),
  );
  return (
    (get![1].list as { id: string; emailId: string; sendAt: string; undoStatus: string }[]) ?? []
  )
    .filter((submission) => submission.undoStatus === "pending")
    .map(({ id, emailId, sendAt }) => ({
      submissionId: id,
      emailId,
      sendAt,
      email: emails.get(emailId),
    }))
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
};

/**
 * Stops a held mail and puts it back among the drafts, to change or send again. Throws when it
 * is already out ("cannotUnsend").
 */
export const unsend = async (
  client: JmapClient,
  accountId: string,
  held: Pick<HeldMail, "submissionId" | "emailId">,
  draftsId: string,
): Promise<void> => {
  // First stopped, then back – never a mail among the drafts that went out anyway.
  const [cancel] = await client.request(
    [
      [
        "EmailSubmission/set",
        { accountId, update: { [held.submissionId]: { undoStatus: "canceled" } } },
        "c",
      ],
    ],
    USING,
  );
  assertSetOk(cancel![1], "Versand");
  const [back] = await client.request(
    [
      [
        "Email/set",
        {
          accountId,
          update: {
            [held.emailId]: { mailboxIds: { [draftsId]: true }, "keywords/$draft": true },
          },
        },
        "e",
      ],
    ],
    USING,
  );
  assertSetOk(back![1], "Entwurf");
};
