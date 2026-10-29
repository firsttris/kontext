/** What the composer starts with for a new mail, a reply, a forward or a saved draft. Pure, so it is tested. */
import type { EmailAddress, EmailDetail } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { prefixSubject, replyRecipients } from "./addresses";
import { displayName, readingDate } from "./format";
import { escapeHtml, quoteHtml } from "./html";

/** The line a forward starts with, below what the user writes above it. */
export const FORWARD_MARKER = "---------- Weitergeleitete Nachricht ----------";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward" | "forwardEml" | "draft";

export type ComposeStart = {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  /** The sender of a draft, to pick the same identity again. */
  from: string | null;
  subject: string;
  html: string;
  inReplyTo: string[] | null;
  references: string[] | null;
  /** Attachments carried along: those of a forwarded original or of a draft. */
  attachments: { blobId: string; name: string; type: string; size: number }[];
};

const empty: ComposeStart = {
  to: [],
  cc: [],
  bcc: [],
  from: null,
  subject: "",
  html: "",
  inReplyTo: null,
  references: null,
  attachments: [],
};

const fileAttachments = (email: EmailDetail): ComposeStart["attachments"] =>
  email.attachments
    .filter((part) => part.blobId && part.disposition !== "inline")
    .map((part) => ({
      blobId: part.blobId!,
      name: part.name ?? "anhang",
      type: part.type,
      size: part.size,
    }));

/** A mail forwarded whole: its raw message is its `blobId` (RFC 8621 §4.1.1). */
export type EmlOriginal = { blobId: string; subject: string | null; size: number };

/** Characters a file name may not hold on Windows or macOS, and control characters. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed
const UNSAFE_IN_NAME = /[\u0000-\u001f\u007f/\\:*?"<>|]+/g;

/** "<Betreff>.eml", safe as a file name on the receiver's disk. */
export const emlName = (subject: string | null): string => {
  const name = (subject ?? "").replace(UNSAFE_IN_NAME, " ").replace(/\s+/g, " ").trim();
  // By code points: a cut inside a UTF-16 pair leaves a lone surrogate, which Stalwart refuses.
  const short = Array.from(name).slice(0, 100).join("").trim();
  return `${short || m.mail_eml_unnamed()}.eml`;
};

/**
 * "Als Anhang weiterleiten": each mail as a message/rfc822 file, by the blob it already has, so
 * nothing is downloaded or uploaded. An encrypted mail goes as it is, still encrypted. Several
 * mails get no subject: none of theirs speaks for all.
 */
export const startEmlForward = (originals: EmlOriginal[]): ComposeStart => ({
  ...empty,
  subject: originals.length === 1 ? prefixSubject("Fwd", originals[0]!.subject) : "",
  attachments: originals.map((original) => ({
    blobId: original.blobId,
    name: emlName(original.subject),
    type: "message/rfc822",
    size: original.size,
  })),
});

/**
 * `originalHtml` is the cleaned body of the original (already sanitized for display), so the
 * quote shows what the user saw.
 */
export const startCompose = (
  mode: Exclude<ComposeMode, "forwardEml">,
  original: EmailDetail | null | undefined,
  originalHtml: string,
  myAddresses: string[],
): ComposeStart => {
  if (mode === "new" || !original) return empty;
  if (mode === "draft") {
    return {
      to: original.to ?? [],
      cc: original.cc ?? [],
      bcc: original.bcc ?? [],
      from: original.from?.[0]?.email ?? null,
      subject: original.subject ?? "",
      html: originalHtml,
      inReplyTo: original.inReplyTo,
      references: original.references,
      attachments: fileAttachments(original),
    };
  }
  const sender = original.from?.[0];
  const header = m.mail_quote_header({
    date: readingDate(original.sentAt ?? original.receivedAt),
    name: displayName(sender),
  });

  if (mode === "forward") {
    const lines = [
      `${m.mail_from()}: ${escapeHtml(displayName(sender))} &lt;${escapeHtml(sender?.email ?? "")}&gt;`,
      `${m.mail_subject()}: ${escapeHtml(original.subject ?? "")}`,
      `${m.mail_to()}: ${escapeHtml((original.to ?? []).map((a) => a.email).join(", "))}`,
    ];
    return {
      ...empty,
      subject: prefixSubject("Fwd", original.subject),
      html: `<p></p><p>${FORWARD_MARKER}<br>${lines.join("<br>")}</p>${originalHtml}`,
      attachments: fileAttachments(original),
    };
  }

  const { to, cc } = replyRecipients(original, myAddresses, mode === "replyAll");
  return {
    ...empty,
    to,
    cc,
    subject: prefixSubject("Re", original.subject),
    html: quoteHtml(header, originalHtml),
    inReplyTo: original.messageId,
    references: [...(original.references ?? [])],
  };
};

/**
 * The sender name for a mail from a shared mailbox: the person and the mailbox's name, so the
 * customer and the colleagues (in the shared Sent folder) see who answered:
 * "Jonas Weber (Weber Haustechnik)".
 */
export const sharedSenderName = (person: string, mailboxName: string): string =>
  person && mailboxName && person !== mailboxName
    ? `${person} (${mailboxName})`
    : mailboxName || person;
