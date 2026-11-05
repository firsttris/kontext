/**
 * A stored mail as the message Stalwart would hand out for its blobId (RFC 8621 §4.1.1): the
 * seed's mails were never MIME text, so the demo writes it from their properties, with the same
 * builder the app uses for the mails it encrypts (src/lib/mime.ts).
 */
import {
  attachmentPart,
  contentPart,
  type MimeAddress,
  type MimeAttachment,
  multipart,
  textPart,
  withHeaders,
} from "@/lib/mime";
import type { Part, Store, StoredEmail } from "./store";

type BodyValues = Record<string, { value: string }>;

const bodyText = (email: StoredEmail, body: unknown, type: string): string | null => {
  const part = (body as Part[] | undefined)?.find((candidate) => candidate.type === type);
  return part
    ? ((email.bodyValues as BodyValues | undefined)?.[part.partId ?? ""]?.value ?? "")
    : null;
};

const filesOf = async (store: Store, email: StoredEmail): Promise<MimeAttachment[]> =>
  Promise.all(
    ((email.attachments ?? []) as Part[]).map(async (part) => ({
      name: part.name ?? "",
      type: part.type,
      bytes: new Uint8Array((await store.blobs.get(part.blobId ?? "")?.arrayBuffer()) ?? []),
      ...(part.cid ? { cid: part.cid } : {}),
    })),
  );

/** Text, with HTML as its alternative where there is one, the files after. */
const entityOf = (text: string, html: string | null, files: MimeAttachment[], id: string) => {
  if (html !== null) return contentPart({ text, html, attachments: files }, id);
  const plain = textPart("text/plain", text);
  return files.length
    ? multipart("mixed", `mix-${id}`, [plain, ...files.map(attachmentPart)])
    : plain;
};

export const rawMessage = async (store: Store, email: StoredEmail): Promise<Blob> => {
  const addresses = (key: string) => (email[key] ?? []) as MimeAddress[];
  const envelope = {
    from: addresses("from")[0] ?? { name: null, email: "" },
    to: addresses("to"),
    cc: addresses("cc"),
    replyTo: addresses("replyTo"),
    subject: (email.subject as string | null) ?? "",
    date: new Date((email.sentAt as string | undefined) ?? email.receivedAt),
    messageId: email.messageId?.[0] ?? `${email.id}@demo.kontext`,
    inReplyTo: email.inReplyTo as string[] | null,
    references: email.references as string[] | null,
  };
  const text = bodyText(email, email.textBody, "text/plain") ?? "";
  const html = bodyText(email, email.htmlBody, "text/html");
  const entity = entityOf(text, html, await filesOf(store, email), email.id);
  return new Blob([withHeaders(envelope, entity)], { type: "message/rfc822" });
};
