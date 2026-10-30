/**
 * Email/import (RFC 8621 §4.8): a whole message the app built itself – an invitation with its
 * calendar part, an encrypted mail – read with postal-mime and stored like any other mail, its
 * attachments as blobs.
 */
import PostalMime from "postal-mime";
import { type Args, type Created, changed, type Result, state } from "./methods";
import { EMPTY_HEADERS, newId, type Part, previewOf, type Store, type StoredEmail } from "./store";

type Address = { name?: string; address?: string };

const addresses = (list: Address[] | Address | undefined) => {
  const all = Array.isArray(list) ? list : list ? [list] : [];
  return all.length ? all.map((a) => ({ name: a.name || null, email: a.address ?? "" })) : null;
};

const leaf = (partId: string, type: string, size: number, extra: Partial<Part> = {}): Part => ({
  partId,
  blobId: null,
  type,
  name: null,
  size,
  cid: null,
  disposition: null,
  subParts: null,
  ...extra,
});

const ids = (value: string | undefined) => (value ? value.match(/[^<>\s]+@[^<>\s]+/g) : null);

/** The message as a stored mail, its attachments put into the store's blobs. */
export const emailOfMessage = async (
  store: Store,
  accountId: string,
  raw: Blob,
  value: Args,
): Promise<StoredEmail> => {
  const message = await PostalMime.parse(await raw.arrayBuffer());
  const id = newId(store, "mail-");
  const text = message.text ?? "";
  const textPart = leaf("1", "text/plain", text.length);
  const htmlPart = message.html ? leaf("2", "text/html", message.html.length) : null;
  const attachments = message.attachments.map((attachment, index) => {
    const blobId = newId(store, "blob-part-");
    const content = attachment.content as ArrayBuffer | string;
    const blob = new Blob([content], { type: attachment.mimeType });
    store.blobs.set(blobId, blob);
    return leaf(String(index + 3), attachment.mimeType, blob.size, {
      blobId,
      name: attachment.filename ?? null,
      disposition: attachment.disposition ?? "attachment",
      cid: attachment.contentId?.replace(/[<>]/g, "") ?? null,
    });
  });
  const blobId = newId(store, "blob-message-");
  store.blobs.set(blobId, raw);
  const now = new Date().toISOString();
  const known = [...(ids(message.inReplyTo) ?? []), ...(ids(message.references) ?? [])];
  const thread = [...store.emails.values()].find(
    (email) => email.accountId === accountId && email.messageId?.some((m) => known.includes(m)),
  );
  return {
    ...EMPTY_HEADERS,
    id,
    accountId,
    blobId,
    threadId: thread?.threadId ?? `thread-${id}`,
    mailboxIds: { ...((value.mailboxIds ?? {}) as Record<string, boolean>) },
    keywords: { ...((value.keywords ?? {}) as Record<string, boolean>) },
    from: addresses(message.from),
    to: addresses(message.to),
    cc: addresses(message.cc),
    bcc: addresses(message.bcc),
    replyTo: addresses(message.replyTo),
    subject: message.subject ?? null,
    receivedAt: (value.receivedAt as string | undefined) ?? now,
    sentAt: message.date ?? now,
    messageId: ids(message.messageId),
    inReplyTo: ids(message.inReplyTo),
    references: ids(message.references),
    preview: previewOf(text),
    hasAttachment: attachments.some((part) => part.disposition !== "inline"),
    size: raw.size,
    bodyStructure: leaf("0", "multipart/mixed", raw.size, {
      partId: null,
      subParts: [textPart, ...(htmlPart ? [htmlPart] : []), ...attachments],
    }),
    textBody: [textPart],
    htmlBody: [htmlPart ?? textPart],
    attachments,
    bodyValues: {
      "1": { value: text, isTruncated: false },
      ...(message.html ? { "2": { value: message.html, isTruncated: false } } : {}),
    },
  };
};

export const emailImport = async (store: Store, args: Args, created: Created): Promise<Result> => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  const notCreated: Result = {};
  for (const [key, value] of Object.entries((args.emails ?? {}) as Record<string, Args>)) {
    const raw = store.blobs.get(String(value.blobId));
    if (!raw) {
      notCreated[key] = { type: "blobNotFound" };
      continue;
    }
    const email = await emailOfMessage(store, accountId, raw, value);
    store.emails.set(email.id, email);
    created.set(key, email.id);
    createdOut[key] = { id: email.id, blobId: email.blobId, threadId: email.threadId };
  }
  changed(store);
  return { accountId, newState: state(store), created: createdOut, notCreated };
};
