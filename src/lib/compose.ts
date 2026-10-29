/** What the composer starts with for a new mail, a reply, a forward or a saved draft. Pure, so it is tested. */
import type { EmailAddress, EmailDetail, Identity } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { prefixSubject, replyRecipients, sameAddress } from "./addresses";
import { displayName, readingDate } from "./format";
import { escapeHtml, quoteHtml } from "./html";

/** The line a forward starts with, below what the user writes above it. */
export const FORWARD_MARKER = "---------- Weitergeleitete Nachricht ----------";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward" | "draft";

export type ComposeStart = {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  /** Where answers go: a draft's own Reply-To; empty otherwise (the identity's default comes later). */
  replyTo: EmailAddress[];
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
  replyTo: [],
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

/**
 * `originalHtml` is the cleaned body of the original (already sanitized for display), so the
 * quote shows what the user saw.
 */
export const startCompose = (
  mode: ComposeMode,
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
      replyTo: original.replyTo ?? [],
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
 * The „Antwort an“ the composer starts with: a draft keeps what it was saved with, anything else
 * gets the default of the sending address (Identity.replyTo).
 */
export const startReplyTo = (
  mode: ComposeMode,
  start: ComposeStart,
  identity: Identity | undefined,
): EmailAddress[] => (mode === "draft" ? start.replyTo : (identity?.replyTo ?? []));

const sameAddresses = (a: EmailAddress[], b: EmailAddress[]) =>
  a.length === b.length && a.every((address, i) => sameAddress(address.email, b[i]!.email));

/**
 * Another sender picked: its default „Antwort an“ takes the place of the previous one's, while
 * addresses the user wrote in by hand stay.
 */
export const switchReplyTo = (
  current: EmailAddress[],
  previous: Identity | undefined,
  next: Identity | undefined,
): EmailAddress[] =>
  sameAddresses(current, previous?.replyTo ?? []) ? (next?.replyTo ?? []) : current;

/**
 * The sender name for a mail from a shared mailbox: the person and the mailbox's name, so the
 * customer and the colleagues (in the shared Sent folder) see who answered:
 * "Jonas Weber (Weber Haustechnik)".
 */
export const sharedSenderName = (person: string, mailboxName: string): string =>
  person && mailboxName && person !== mailboxName
    ? `${person} (${mailboxName})`
    : mailboxName || person;
