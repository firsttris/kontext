/**
 * Pflichtangaben: the lines a business letter must carry (§ 35a GmbHG, § 37a HGB – Handelsregister,
 * Geschäftsführer, Sitz …), set once by the Firmenverwaltung and put under every mail as it goes
 * out. Plain text only, so nobody's mail carries foreign markup; the HTML is built here.
 */
import { escapeHtml } from "./html";

/** As long as the server keeps it (server/company/legal-footer.ts). */
export const LEGAL_FOOTER_MAX = 2000;

/** Line ends unified, trailing blanks and runs of empty lines taken out, trimmed. */
export const normalFooter = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * The footer as HTML: small and grey under a thin line, so it reads as the letterhead's foot and
 * not as part of the text. Inline styles, because mail clients drop style sheets.
 */
export const legalFooterHtml = (footer: string): string => {
  const paragraphs = normalFooter(footer)
    .split("\n\n")
    .map(
      (paragraph) =>
        `<p style="margin:0 0 6px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return `<div data-legal-footer="" style="margin-top:24px;padding-top:8px;border-top:1px solid #d4d4d8;color:#71717a;font-size:12px;line-height:1.5">${paragraphs}</div>`;
};

/**
 * A mail's HTML without the footer `legalFooterHtml` put there: a mail taken back with
 * „Rückgängig“ (or left over from a failed send) opens as a draft, and the footer goes on again
 * when it is sent. The footer holds only paragraphs, so its block ends at the first `</div>`.
 */
export const withoutLegalFooter = (html: string): string =>
  html.replace(/<div\b[^>]*\bdata-legal-footer\b[^>]*>[\s\S]*?<\/div>/gi, "");

export type MailBody = { html: string; text: string };

/** The body with the footer at its very end (below a quoted original too); unchanged without one. */
export const withLegalFooter = <T extends MailBody>(
  mail: T,
  footer: string | null | undefined,
): T => {
  const clean = normalFooter(footer ?? "");
  if (!clean) return mail;
  return {
    ...mail,
    html: `${mail.html}${legalFooterHtml(clean)}`,
    text: mail.text ? `${mail.text}\n\n${clean}` : clean,
  };
};
