/**
 * Sending a mail the app built itself (an encrypted one): uploaded as it is, put into Drafts
 * (Email/import), submitted, and moved to Sent on success – like sendEmail, also held for
 * "Rückgängig" or "Später senden". The recipients go in the envelope, Bcc included.
 */
import { type Hold, holdParameters } from "@/lib/envelope";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

export const sendRaw = async (
  client: JmapClient,
  {
    accountId,
    raw,
    identityId,
    from,
    recipients,
    draftsId,
    sentId,
    hold,
    replacesDraft,
  }: {
    accountId: string;
    raw: string;
    identityId: string;
    from: string;
    recipients: string[];
    draftsId: string;
    sentId: string;
    hold?: Hold;
    /** A saved draft of this mail, removed with the sending. */
    replacesDraft?: string | null;
  },
): Promise<{ emailId: string; submissionId: string }> => {
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const parameters = hold ? holdParameters(hold) : undefined;
  const responses = await client.request(
    [
      [
        "Email/import",
        {
          accountId,
          emails: {
            draft: {
              blobId,
              mailboxIds: { [draftsId]: true },
              keywords: { $seen: true, $draft: true },
            },
          },
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId,
          create: {
            send: {
              identityId,
              emailId: "#draft",
              envelope: {
                mailFrom: { email: from, ...(parameters ? { parameters } : {}) },
                rcptTo: recipients.map((email) => ({ email })),
              },
            },
          },
          onSuccessUpdateEmail: {
            "#send": {
              [`mailboxIds/${draftsId}`]: null,
              [`mailboxIds/${sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "1",
      ],
      ...(replacesDraft
        ? [
            ["Email/set", { accountId, destroy: [replacesDraft] }, "2"] as [
              string,
              Record<string, unknown>,
              string,
            ],
          ]
        : []),
    ],
    [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission],
  );
  assertSetOk(responses[0]![1], "Entwurf");
  assertSetOk(responses[1]![1], "Versand");
  const created = (result: unknown, key: string) =>
    (result as { created?: Record<string, { id: string }> }).created?.[key]?.id ?? "";
  return {
    emailId: created(responses[0]![1], "draft"),
    submissionId: created(responses[1]![1], "send"),
  };
};
