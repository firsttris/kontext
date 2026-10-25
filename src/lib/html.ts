/**
 * Mail bodies: turning plain text into HTML, cleaning foreign HTML before it is shown, and building
 * the quoted original for replies. DOMPurify needs a DOM, so `sanitizeMailHtml` runs in the browser.
 */
import DOMPurify from "dompurify";
import { cleanCss } from "./mail-css";

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

/** Attributes that make the browser fetch something (`href` only outside links, e.g. SVG `<image>`). */
const LOADING_ATTRIBUTES = ["src", "background", "poster", "href", "xlink:href"];
const isLink = (element: Element) => ["a", "area"].includes(element.localName);

/**
 * Whether a URL stays inside the mail. Everything else is fetched: `//host` and `\\host` too, and a
 * relative path, which resolves against the app (a srcdoc document has its parent's base URL).
 */
const isLocalUrl = (url: string) => /^\s*(data:|#)/i.test(url);

/** Text and addresses that are only followed, never fetched. */
const TEXT_ATTRIBUTES = ["alt", "title", "cite", "longdesc", "usemap"];

/**
 * Text and addresses are no CSS; any other attribute might be read as CSS (SVG's fill, mask,
 * filter, …), so all others are cleaned as CSS, which leaves what fetches nothing as it is.
 */
const isCss = (name: string) =>
  !LOADING_ATTRIBUTES.includes(name) &&
  !TEXT_ATTRIBUTES.includes(name) &&
  !name.startsWith("aria-");

/**
 * Cleans foreign mail HTML. Scripts, forms and event handlers go; links open in a new tab.
 * Remote images stay blocked (they reveal that the mail was read) until `allowRemote` is set:
 * every address that would be fetched goes (img, video poster, SVG image, CSS in style
 * attributes and `<style>`), counted in `blockedImages`. `cidUrls` maps Content-IDs of inline
 * images to local object URLs. `mailDocument` adds a CSP as a second line of defence.
 */
export const sanitizeMailHtml = (
  html: string,
  { allowRemote, cidUrls }: { allowRemote: boolean; cidUrls: Record<string, string> },
): SanitizedMail => {
  let blockedImages = 0;
  const purify = DOMPurify();
  purify.addHook("afterSanitizeElements", (node) => {
    if (allowRemote || (node as Element).localName !== "style") return;
    const { css, blocked } = cleanCss(node.textContent ?? "", {
      allowRemote,
      cidUrls,
      rules: true,
    });
    node.textContent = css;
    blockedImages += blocked;
  });
  purify.addHook("afterSanitizeAttributes", (node) => {
    const element = node as Element;
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
    for (const attribute of LOADING_ATTRIBUTES) {
      const value = element.getAttribute?.(attribute);
      if (!value || (attribute.endsWith("href") && isLink(element))) continue;
      if (value.startsWith("cid:")) {
        const url = cidUrls[value.slice(4).replace(/^<|>$/g, "")];
        if (url) element.setAttribute(attribute, url);
        else element.removeAttribute(attribute);
      } else if (!allowRemote && !isLocalUrl(value)) {
        element.removeAttribute(attribute);
        blockedImages++;
      }
    }
    // CSS images: `style`, and while blocked any attribute read as CSS (SVG's fill, mask, …).
    // Once remote content is allowed, the others stay as they were.
    for (const { name, value } of [...(element.attributes ?? [])]) {
      if (name !== "style" && (allowRemote || !isCss(name))) continue;
      const { css, blocked } = cleanCss(value, { allowRemote, cidUrls });
      if (css !== value) element.setAttribute(name, css);
      blockedImages += blocked;
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

/**
 * What the mail document may fetch: inline styles, `data:` and the `blob:` URLs of inline images;
 * remote images, media, fonts and stylesheets only once they are allowed. A second line behind
 * `sanitizeMailHtml`, for whatever its cleaning misses (a `<meta>` CSP also holds in a srcdoc);
 * the reading pane and the printed page (print.ts) carry it.
 */
export const mailPolicy = (allowRemote: boolean) => {
  const remote = allowRemote ? " https: http:" : "";
  return [
    "default-src 'none'",
    `style-src 'unsafe-inline'${remote}`,
    `img-src data: blob:${remote}`,
    `media-src data: blob:${remote}`,
    `font-src data:${remote}`,
  ].join("; ");
};

/**
 * The document shown inside the sandboxed iframe of the reading pane. The body is a flow root so
 * the last paragraph's margin stays inside it: mail-body.tsx fits the frame to body.scrollHeight,
 * and a margin sticking out would give the frame its own scrollbar.
 */
export const mailDocument = (
  body: string,
  dark: boolean,
  allowRemote = false,
): string => `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${mailPolicy(allowRemote)}">
<base target="_blank">
<style>
  html { color-scheme: ${dark ? "dark" : "light"}; }
  body { margin: 0; display: flow-root; font: 15px/1.65 "Geist Variable", system-ui, sans-serif; color: ${dark ? "#fafafa" : "#09090b"}; background: transparent; overflow-wrap: anywhere; }
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
