/** Mail operations on top of the JMAP client (RFC 8621). Each function is one round-trip. */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";
import type { BodyPart, EmailAddress, EmailDetail, EmailSummary, Identity, Mailbox } from "./types";

export const SUMMARY_PROPERTIES = [
  "threadId",
  "mailboxIds",
  "keywords",
  "from",
  "to",
  "subject",
  "receivedAt",
  "preview",
  "hasAttachment",
  "size",
];

const DETAIL_PROPERTIES = [
  ...SUMMARY_PROPERTIES,
  "cc",
  "bcc",
  "replyTo",
  "sentAt",
  "messageId",
  "references",
  "inReplyTo",
  "htmlBody",
  "textBody",
  "attachments",
  "bodyValues",
];

const BODY_PROPERTIES = ["partId", "blobId", "type", "name", "size", "cid", "disposition"];

export const listMailboxes = async (client: JmapClient, accountId: string): Promise<Mailbox[]> => {
  const { list } = await client.call<{ list: Mailbox[] }>("Mailbox/get", {
    accountId,
    properties: [
      "name",
      "parentId",
      "role",
      "sortOrder",
      "totalEmails",
      "unreadEmails",
      "myRights",
    ],
  });
  return list;
};

export type EmailFilter = { mailboxId: string; text?: string; unreadOnly?: boolean };

export const emailQueryFilter = ({ mailboxId, text, unreadOnly }: EmailFilter) => {
  const conditions: Record<string, unknown>[] = [{ inMailbox: mailboxId }];
  if (text?.trim()) conditions.push({ text: text.trim() });
  if (unreadOnly) conditions.push({ notKeyword: "$seen" });
  return conditions.length === 1 ? conditions[0]! : { operator: "AND", conditions };
};

export type EmailPage = { emails: EmailSummary[]; total: number; position: number };

export const queryEmails = async (
  client: JmapClient,
  accountId: string,
  filter: EmailFilter,
  position: number,
  limit = 50,
): Promise<EmailPage> => {
  const [query, get] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: emailQueryFilter(filter),
        sort: [{ property: "receivedAt", isAscending: false }],
        position,
        limit,
        calculateTotal: true,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: SUMMARY_PROPERTIES,
      },
      "g",
    ],
  ]);
  return {
    emails: (get![1].list as EmailSummary[]) ?? [],
    total: Number(query![1].total ?? 0),
    position,
  };
};

export const getEmail = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<EmailDetail | null> => {
  const { list } = await client.call<{ list: EmailDetail[] }>("Email/get", {
    accountId,
    ids: [id],
    properties: DETAIL_PROPERTIES,
    bodyProperties: BODY_PROPERTIES,
    fetchHTMLBodyValues: true,
    fetchTextBodyValues: true,
    maxBodyValueBytes: 2_000_000,
  });
  return list[0] ?? null;
};

/** Emails exchanged with an address, newest first, for the contact view. */
export const emailsWithAddress = async (
  client: JmapClient,
  accountId: string,
  address: string,
  limit = 5,
): Promise<EmailSummary[]> => {
  const [, get] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: {
          operator: "OR",
          conditions: [{ from: address }, { to: address }, { cc: address }],
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: SUMMARY_PROPERTIES,
      },
      "g",
    ],
  ]);
  return (get![1].list as EmailSummary[]) ?? [];
};

const updateEmails = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<void> => {
  const result = await client.call("Email/set", {
    accountId,
    update: Object.fromEntries(ids.map((id) => [id, patch])),
  });
  assertSetOk(result, "Email/set");
};

export const setKeyword = (
  client: JmapClient,
  accountId: string,
  ids: string[],
  keyword: string,
  on: boolean,
) => updateEmails(client, accountId, ids, { [`keywords/${keyword}`]: on ? true : null });

export const moveEmails = (
  client: JmapClient,
  accountId: string,
  ids: string[],
  fromMailboxId: string,
  toMailboxId: string,
) =>
  updateEmails(client, accountId, ids, {
    [`mailboxIds/${fromMailboxId}`]: null,
    [`mailboxIds/${toMailboxId}`]: true,
  });

export const destroyEmails = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
): Promise<void> => {
  assertSetOk(await client.call("Email/set", { accountId, destroy: ids }), "Email/set");
};

export const createMailbox = async (
  client: JmapClient,
  accountId: string,
  name: string,
  parentId: string | null,
  role?: string,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Mailbox/set", {
    accountId,
    create: { m: { name, parentId, ...(role ? { role } : {}) } },
  });
  assertSetOk(result, "Mailbox/set");
  return result.created!.m!.id;
};

export const listIdentities = async (
  client: JmapClient,
  accountId: string,
): Promise<Identity[]> => {
  const { list } = await client.call<{ list: Identity[] }>("Identity/get", { accountId }, [
    CAPABILITIES.core,
    CAPABILITIES.mail,
    CAPABILITIES.submission,
  ]);
  return list;
};

export type Quota = { used: number; limit: number | null };

export const getQuota = async (client: JmapClient, accountId: string): Promise<Quota | null> => {
  try {
    const { list } = await client.call<{
      list: { used: number; hardLimit: number; resourceType: string }[];
    }>("Quota/get", { accountId }, [CAPABILITIES.core, "urn:ietf:params:jmap:quota"]);
    const octets = list.find((quota) => quota.resourceType === "octets");
    return octets ? { used: octets.used, limit: octets.hardLimit || null } : null;
  } catch {
    return null;
  }
};

export type OutgoingAttachment = { blobId: string; name: string; type: string; size: number };

export type OutgoingEmail = {
  accountId: string;
  identity: Identity;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  html: string;
  text: string;
  attachments: OutgoingAttachment[];
  inReplyTo?: string[] | null;
  references?: string[] | null;
  /** A saved draft this mail replaces; it is removed after sending. */
  draftId?: string | null;
};

const emailCreate = (mail: OutgoingEmail, mailboxIds: Record<string, boolean>, draft: boolean) => ({
  mailboxIds,
  keywords: { $seen: true, ...(draft ? { $draft: true } : {}) },
  from: [{ name: mail.identity.name, email: mail.identity.email }],
  to: mail.to,
  cc: mail.cc,
  bcc: mail.bcc,
  ...(mail.identity.replyTo?.length ? { replyTo: mail.identity.replyTo } : {}),
  subject: mail.subject,
  ...(mail.inReplyTo?.length ? { inReplyTo: mail.inReplyTo } : {}),
  ...(mail.references?.length || mail.inReplyTo?.length
    ? { references: [...(mail.references ?? []), ...(mail.inReplyTo ?? [])] }
    : {}),
  bodyValues: { text: { value: mail.text }, html: { value: mail.html } },
  textBody: [{ partId: "text", type: "text/plain" }],
  htmlBody: [{ partId: "html", type: "text/html" }],
  attachments: mail.attachments.map(({ blobId, name, type }) => ({
    blobId,
    name,
    type,
    disposition: "attachment",
  })),
});

/** Creates the mail in Drafts, submits it, and on success moves it to Sent (RFC 8621 §7.5). */
export const sendEmail = async (
  client: JmapClient,
  mail: OutgoingEmail,
  mailboxes: { draftsId: string; sentId: string },
): Promise<void> => {
  const responses = await client.request(
    [
      [
        "Email/set",
        {
          accountId: mail.accountId,
          create: { draft: emailCreate(mail, { [mailboxes.draftsId]: true }, true) },
          ...(mail.draftId ? { destroy: [mail.draftId] } : {}),
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: mail.accountId,
          create: { send: { identityId: mail.identity.id, emailId: "#draft" } },
          onSuccessUpdateEmail: {
            "#send": {
              [`mailboxIds/${mailboxes.draftsId}`]: null,
              [`mailboxIds/${mailboxes.sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "1",
      ],
    ],
    [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission],
  );
  assertSetOk(responses[0]![1], "Entwurf");
  assertSetOk(responses[1]![1], "Versand");
};

export const saveDraft = async (
  client: JmapClient,
  mail: OutgoingEmail,
  draftsId: string,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Email/set", {
    accountId: mail.accountId,
    create: { draft: emailCreate(mail, { [draftsId]: true }, true) },
    ...(mail.draftId ? { destroy: [mail.draftId] } : {}),
  });
  assertSetOk(result, "Entwurf");
  return result.created!.draft!.id;
};

/** The part to display: the HTML body if there is one, else the text body as HTML. */
export const displayBody = (email: EmailDetail): { kind: "html" | "text"; value: string } => {
  const pick = (parts: BodyPart[]) =>
    parts
      .map((part) => (part.partId ? email.bodyValues[part.partId]?.value : undefined))
      .filter(Boolean)
      .join("\n");
  const hasHtml = email.htmlBody.some((part) => part.type === "text/html");
  if (hasHtml) return { kind: "html", value: pick(email.htmlBody) };
  return { kind: "text", value: pick(email.textBody) };
};

export const isUnread = (email: Pick<EmailSummary, "keywords">): boolean => !email.keywords.$seen;
export const isFlagged = (email: Pick<EmailSummary, "keywords">): boolean =>
  Boolean(email.keywords.$flagged);
