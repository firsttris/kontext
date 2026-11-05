/** What the composer starts with for a new mail, a reply, a forward or a saved draft. Pure, so it is tested. */
import type { EmailAddress, EmailDetail, Identity } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { prefixSubject, replyRecipients, sameAddress } from "./addresses";
import { displayName, readingDate } from "./format";
import { escapeHtml, quoteHtml } from "./html";
import { bareCid, inlineParts, shownCids } from "./inline-images";

/** The line a forward starts with, below what the user writes above it. */
export const FORWARD_MARKER = "---------- Weitergeleitete Nachricht ----------";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward" | "forwardEml" | "draft";

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
  /** Pictures in the text, by Content-ID: those of a draft, or of the quoted or forwarded original. */
  images: { blobId: string; name: string; type: string; size: number; cid: string }[];
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
  images: [],
};

/**
 * The pictures of a mail by their Content-ID (RFC 2392); with `shown`, only those its text shows.
 * A reply sends them again as parts of its own under the same Content-ID, so the quote keeps them.
 */
const pictures = (email: EmailDetail, shown?: string[]): ComposeStart["images"] =>
  inlineParts(email)
    .map((part) => ({
      blobId: part.blobId!,
      name: part.name ?? "bild",
      type: part.type,
      size: part.size,
      cid: bareCid(part.cid!),
    }))
    .filter((image) => !shown || shown.includes(image.cid));

/** The files of a mail, without the pictures its text shows (`shown`), which go as pictures. */
const fileAttachments = (email: EmailDetail, shown: string[] = []): ComposeStart["attachments"] =>
  email.attachments
    .filter(
      (part) =>
        part.blobId &&
        part.disposition !== "inline" &&
        !(part.cid && shown.includes(bareCid(part.cid))),
    )
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

/** The text without what a file name may not hold; leading dots would hide the file. */
export const safeFileName = (text: string | null): string =>
  (text ?? "")
    .replace(UNSAFE_IN_NAME, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();

/** "<Betreff>.<extension>", safe as a file name on the receiver's disk. */
export const subjectFileName = (subject: string | null, extension: string): string => {
  // By code points: a cut inside a UTF-16 pair leaves a lone surrogate, which Stalwart refuses.
  const short = Array.from(safeFileName(subject)).slice(0, 100).join("").trim();
  return `${short || m.mail_eml_unnamed()}.${extension}`;
};

/** "<Betreff>.eml" */
export const emlName = (subject: string | null): string => subjectFileName(subject, "eml");

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
 * quote shows what the user saw; its pictures carry their Content-ID (`data-cid`) and come along.
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
      replyTo: original.replyTo ?? [],
      from: original.from?.[0]?.email ?? null,
      subject: original.subject ?? "",
      html: originalHtml,
      inReplyTo: original.inReplyTo,
      references: original.references,
      attachments: fileAttachments(original),
      images: pictures(original),
    };
  }
  const shown = shownCids(originalHtml);
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
      attachments: fileAttachments(original, shown),
      images: pictures(original, shown),
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
    images: pictures(original, shown),
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
 * The identities of a shared mailbox with the default „Antwort an“ set in the settings: those
 * edit the identities in the personal account (Einstellungen → Signatur), while Stalwart gives
 * the shared account identities of its own for the same addresses.
 */
export const withOwnReplyTo = (identities: Identity[], own: Identity[]): Identity[] =>
  identities.map((identity) => {
    if (identity.replyTo?.length) return identity;
    const mine = own.find((o) => sameAddress(o.email, identity.email));
    return mine?.replyTo?.length ? { ...identity, replyTo: mine.replyTo } : identity;
  });

/**
 * The sender name for a mail from a shared mailbox: the person and the mailbox's name, so the
 * customer and the colleagues (in the shared Sent folder) see who answered:
 * "Jonas Weber (Weber Haustechnik)".
 */
export const sharedSenderName = (person: string, mailboxName: string): string =>
  person && mailboxName && person !== mailboxName
    ? `${person} (${mailboxName})`
    : mailboxName || person;
