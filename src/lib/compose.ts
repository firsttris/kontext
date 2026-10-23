/** What the composer starts with for a new mail, a reply or a forward. Pure, so it is tested. */
import type { EmailAddress, EmailDetail } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { prefixSubject, replyRecipients } from "./addresses";
import { displayName, readingDate } from "./format";
import { escapeHtml, quoteHtml } from "./html";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export type ComposeStart = {
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  html: string;
  inReplyTo: string[] | null;
  references: string[] | null;
  /** Attachments of the original that a forward carries along. */
  forwardAttachments: { blobId: string; name: string; type: string; size: number }[];
};

const empty: ComposeStart = {
  to: [],
  cc: [],
  subject: "",
  html: "",
  inReplyTo: null,
  references: null,
  forwardAttachments: [],
};

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
      html: `<p></p><p>---------- Weitergeleitete Nachricht ----------<br>${lines.join("<br>")}</p>${originalHtml}`,
      forwardAttachments: original.attachments
        .filter((part) => part.blobId && part.disposition !== "inline")
        .map((part) => ({
          blobId: part.blobId!,
          name: part.name ?? "anhang",
          type: part.type,
          size: part.size,
        })),
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
