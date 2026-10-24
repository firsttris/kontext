/**
 * Conversations without changing the list: the mails of a thread around the one being read (what
 * came before, what answered it since), who of the team answered a mail in a shared mailbox, and
 * the quoted original below a reply, to fold away when the earlier mails are right there. Pure;
 * the thread is JMAP's (RFC 8621 §3), across all folders of one account.
 */
import type { EmailSummary } from "@/jmap/types";

export type ThreadMail = Pick<
  EmailSummary,
  "id" | "from" | "subject" | "receivedAt" | "preview" | "mailboxIds" | "keywords"
>;

const time = (mail: Pick<EmailSummary, "receivedAt">) => Date.parse(mail.receivedAt);

/**
 * The other mails of the conversation, oldest first, split at the one being read. Drafts and
 * what lies in the trash or spam (`hidden`) do not count.
 */
export const aroundMail = <T extends ThreadMail>(
  thread: T[],
  current: Pick<EmailSummary, "id" | "receivedAt">,
  hidden: string[],
): { earlier: T[]; later: T[] } => {
  const counted = thread
    .filter((mail) => mail.id !== current.id && !mail.keywords.$draft)
    .filter((mail) => !Object.keys(mail.mailboxIds).some((id) => hidden.includes(id)))
    .sort((a, b) => time(a) - time(b));
  return {
    earlier: counted.filter((mail) => time(mail) <= time(current)),
    later: counted.filter((mail) => time(mail) > time(current)),
  };
};

/** "Jonas Weber (Weber Haustechnik)" → "Jonas Weber": who of the team, without the mailbox. */
export const personOf = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

/**
 * Who answered a mail, and when: the latest mail of its conversation in the Sent folder after
 * it (in a shared mailbox, a colleague's answer as the mailbox).
 */
export const answeredBy = (
  thread: ThreadMail[],
  mail: Pick<EmailSummary, "id" | "receivedAt">,
  sentId: string | undefined,
): { name: string; at: string } | null => {
  if (!sentId) return null;
  const reply = thread
    .filter((other) => other.mailboxIds[sentId] && time(other) > time(mail))
    .sort((a, b) => time(b) - time(a))[0];
  if (!reply) return null;
  const sender = reply.from?.[0];
  return { name: personOf(sender?.name || sender?.email || ""), at: reply.receivedAt };
};

/** Where a quoted original begins, as mail programs mark it. */
const QUOTE_START = [
  ".gmail_quote",
  "#divRplyFwdMsg",
  "#appendonsend",
  ".moz-cite-prefix",
  'blockquote[type="cite"]',
  "blockquote",
];

/** The line before the quote: "Am 24.10.2026 um 09:31 schrieb Markus Hoffmann:". */
const ATTRIBUTION = /\b(schrieb|wrote|a écrit)\b.*:\s*$/i;

const hasText = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() !== "";

/**
 * The reply and the quote below it, split. No split when nothing is quoted or the mail is nothing
 * but the quote (a forward).
 */
export const splitQuote = (html: string): { main: string; quote: string | null } => {
  if (typeof DOMParser === "undefined") return { main: html, quote: null };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let start: Element | null = null;
  for (const selector of QUOTE_START) {
    start = doc.body.querySelector(selector);
    if (start) break;
  }
  if (!start) return { main: html, quote: null };
  // From the quote's outermost element below the body, and with the attribution line.
  while (start.parentElement && start.parentElement !== doc.body && !start.previousElementSibling) {
    start = start.parentElement;
  }
  const before = start.previousElementSibling;
  if (before && ATTRIBUTION.test(before.textContent ?? "")) start = before;
  if (start.previousElementSibling?.tagName === "HR") start = start.previousElementSibling;
  const quote: Element[] = [];
  for (let node: Element | null = start; node; node = node.nextElementSibling) quote.push(node);
  const quoteHtml = quote.map((node) => node.outerHTML).join("");
  for (const node of quote) node.remove();
  const main = doc.body.innerHTML;
  return hasText(main) ? { main, quote: quoteHtml } : { main: html, quote: null };
};

/** The same for a text mail: from the attribution line or the first block of "> " lines. */
export const splitTextQuote = (text: string): { main: string; quote: string | null } => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((line) => line.startsWith(">") || ATTRIBUTION.test(line));
  if (at < 0) return { main: text, quote: null };
  const main = lines.slice(0, at).join("\n").trimEnd();
  return main ? { main, quote: lines.slice(at).join("\n") } : { main: text, quote: null };
};
