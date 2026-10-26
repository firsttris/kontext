/**
 * A mail as a page to print: subject, sender, recipients, date, the mailbox it is in, the text
 * and the names of the attachments; light, on A4, without the app around it. Remote content is
 * never printed: the body comes cleaned with it blocked, and the page's CSP holds it out. Pure.
 */
import type { EmailAddress } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { escapeHtml, mailPolicy } from "./html";

export type PrintableMail = {
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  /** As people read it ("Sa., 24. Oktober 2026 um 14:46"). */
  date: string;
  /** A shared mailbox's address; the own one is not named. */
  mailbox?: string;
  /** Already sanitized (html.ts), with inline images resolved. */
  body: string;
  attachments: { name: string; size: string }[];
};

const address = ({ name, email }: EmailAddress) =>
  name?.trim() ? `${escapeHtml(name.trim())} &lt;${escapeHtml(email)}&gt;` : escapeHtml(email);

const row = (label: string, value: string) =>
  value ? `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>` : "";

export const printDocument = (mail: PrintableMail): string => `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${mailPolicy(false)}"><title>${escapeHtml(mail.subject)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html { color-scheme: light; }
  body { margin: 0; font: 11pt/1.5 "Geist Variable", system-ui, sans-serif; color: #09090b; overflow-wrap: anywhere; }
  h1 { margin: 0 0 10pt; font-size: 16pt; line-height: 1.3; }
  table.head { border-collapse: collapse; margin-bottom: 12pt; font-size: 9.5pt; }
  table.head th { text-align: left; font-weight: 500; color: #71717a; padding: 1pt 12pt 1pt 0; vertical-align: top; white-space: nowrap; }
  table.head td { padding: 1pt 0; }
  hr { border: 0; border-top: 1px solid #e4e4e7; margin: 0 0 14pt; }
  .body p { margin: 0 0 0.8em; }
  .body img { max-width: 100%; height: auto; }
  .body a { color: inherit; }
  .body blockquote { margin: 0.5em 0; padding-left: 10pt; border-left: 2px solid #e4e4e7; color: #52525b; }
  .body table { max-width: 100%; }
  .body pre { white-space: pre-wrap; }
  .files { margin-top: 16pt; padding-top: 8pt; border-top: 1px solid #e4e4e7; font-size: 9.5pt; color: #52525b; }
  .files ul { margin: 4pt 0 0; padding-left: 14pt; }
</style></head><body>
<h1>${escapeHtml(mail.subject || m.mail_no_subject())}</h1>
<table class="head">
${row(m.print_from(), mail.from.map(address).join(", "))}
${row(m.print_to(), mail.to.map(address).join(", "))}
${row("Cc", mail.cc.map(address).join(", "))}
${row(m.print_date(), escapeHtml(mail.date))}
${row(m.print_mailbox(), mail.mailbox ? escapeHtml(mail.mailbox) : "")}
</table>
<hr>
<div class="body">${mail.body}</div>
${
  mail.attachments.length
    ? `<div class="files">${escapeHtml(m.print_attachments({ count: mail.attachments.length }))}<ul>${mail.attachments
        .map((file) => `<li>${escapeHtml(file.name)} (${escapeHtml(file.size)})</li>`)
        .join("")}</ul></div>`
    : ""
}
</body></html>`;
