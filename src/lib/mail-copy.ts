/**
 * A mail shared as a copy in the chat: what it holds (who, when, the body) and which of its
 * attachments go along – for colleagues who cannot open the mailbox. Pure.
 */
import { displayBody } from "@/jmap/mail";
import type { BodyPart, EmailDetail } from "@/jmap/types";
import type { MailCopy } from "../../server/chat/chat";
import { MAX_FILE_BYTES, MAX_FILES } from "../../server/chat/chat";
import { fullAddress } from "./format";

const list = (addresses: EmailDetail["to"]) => (addresses ?? []).map(fullAddress).join(", ");

export const mailCopyOf = (email: EmailDetail): MailCopy => {
  const body = displayBody(email);
  return {
    subject: email.subject ?? "",
    from: list(email.from),
    to: list(email.to),
    cc: list(email.cc),
    receivedAt: email.receivedAt,
    kind: body.kind,
    body: body.value,
  };
};

/**
 * The attachments that go along: real ones (not pictures inside the text), each within the chat's
 * size, as many as a message holds.
 */
export const copyAttachments = (email: Pick<EmailDetail, "attachments">): BodyPart[] =>
  email.attachments
    .filter(
      (part) =>
        part.blobId && !(part.cid && part.disposition === "inline") && part.size <= MAX_FILE_BYTES,
    )
    .slice(0, MAX_FILES);

/** The file holding the copy: "Angebot Bad.mail.json". */
export const copyFileName = (subject: string): string =>
  `${(subject || "Mail")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)}.mail.json`;
