/**
 * Mail bodies: turning plain text into HTML, cleaning foreign HTML before it is shown, and building
 * the quoted original for replies. DOMPurify needs a DOM, so `sanitizeMailHtml` runs in the browser.
 */
import DOMPurify from "dompurify";

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Plain text to simple HTML: paragraphs, line breaks and clickable links. */
export const textToHtml = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(
        URL_PATTERN,
        (url) => `<a href="${url}">${url}</a>`,
      );
      return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

export type SanitizedMail = { html: string; blockedImages: number };

/**
 * Cleans foreign mail HTML. Scripts, forms and event handlers go; links open in a new tab.
 * Remote images stay blocked (they reveal that the mail was read) until `allowRemote` is set.
 * `cidUrls` maps Content-IDs of inline images to local object URLs.
 */
export const sanitizeMailHtml = (
  html: string,
  { allowRemote, cidUrls }: { allowRemote: boolean; cidUrls: Record<string, string> },
): SanitizedMail => {
  let blockedImages = 0;
  const purify = DOMPurify();
  purify.addHook("afterSanitizeAttributes", (node) => {
    const element = node as Element;
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
    for (const attribute of ["src", "background"]) {
      const value = element.getAttribute?.(attribute);
      if (!value) continue;
      if (value.startsWith("cid:")) {
        const url = cidUrls[value.slice(4).replace(/^<|>$/g, "")];
        if (url) element.setAttribute(attribute, url);
        else element.removeAttribute(attribute);
      } else if (/^https?:/i.test(value) && !allowRemote) {
        element.removeAttribute(attribute);
        blockedImages++;
      }
    }
    // CSS images: only http(s), and only when remote content is allowed.
    const style = element.getAttribute?.("style");
    if (style && /url\(/i.test(style)) {
      element.setAttribute(
        "style",
        style.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (whole, _quote, url: string) =>
          allowRemote && /^https?:/i.test(url.trim()) ? whole : "none",
        ),
      );
    }
  });
  const clean = purify.sanitize(html, {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: [
      "script",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
    ],
    FORBID_ATTR: ["srcset"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ADD_ATTR: ["target"],
  });
  return { html: clean, blockedImages };
};

/** The document shown inside the sandboxed iframe of the reading pane. */
export const mailDocument = (body: string, dark: boolean): string => `<!doctype html>
<html><head><meta charset="utf-8"><base target="_blank">
<style>
  html { color-scheme: ${dark ? "dark" : "light"}; }
  body { margin: 0; font: 15px/1.65 "Geist Variable", system-ui, sans-serif; color: ${dark ? "#fafafa" : "#09090b"}; background: transparent; overflow-wrap: anywhere; }
  p { margin: 0 0 0.9em; }
  img { max-width: 100%; height: auto; }
  a { color: ${dark ? "#60a5fa" : "#2563eb"}; }
  blockquote { margin: 0.5em 0; padding-left: 12px; border-left: 2px solid ${dark ? "#3f3f46" : "#e4e4e7"}; color: ${dark ? "#a1a1aa" : "#52525b"}; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; }
</style></head><body>${body}</body></html>`;

/** Visible text of an HTML fragment, for the text/plain part of a sent mail. */
export const htmlToText = (html: string): string => {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const container = document.createElement("div");
  container.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "</$1>\n");
  return (container.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
};

/** The original below a reply, as an HTML quote. */
export const quoteHtml = (header: string, originalHtml: string): string =>
  `<p></p><p>${escapeHtml(header)}</p><blockquote>${originalHtml}</blockquote>`;
