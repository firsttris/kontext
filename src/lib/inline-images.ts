/**
 * Images in the text of a mail being written. In the editor an image shows from a local object
 * URL and carries its Content-ID as `data-cid`; the mail sends `src="cid:…"` with the image as a
 * part of its own (mail-structure.ts, mime.ts). A draft opened again goes the other way. Pure
 * apart from parsing in a document of its own, which loads nothing.
 */

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

/** A new Content-ID: unique, and an addr-spec as RFC 2392 wants it. */
export const newCid = (id: string): string => `bild-${id}@kontext`;

/**
 * The HTML to send: each image with a Content-ID points to it (`cid:`), the local URL and the
 * mark are gone; `cids` are the images the text still shows.
 */
export const sendableHtml = (html: string): { html: string; cids: string[] } => {
  if (!html.includes("data-cid")) return { html, cids: [] };
  const doc = parse(html);
  const cids: string[] = [];
  for (const img of doc.querySelectorAll("img[data-cid]")) {
    const cid = img.getAttribute("data-cid")!;
    img.setAttribute("src", `cid:${cid}`);
    img.removeAttribute("data-cid");
    cids.push(cid);
  }
  return { html: doc.body.innerHTML, cids: [...new Set(cids)] };
};

/**
 * A saved draft's images marked with their Content-ID, before the HTML is cleaned (which turns
 * `cid:` into the local URL and would lose which image it was).
 */
export const markCids = (html: string): string => {
  if (!/src\s*=\s*["']?cid:/i.test(html)) return html;
  const doc = parse(html);
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (/^cid:/i.test(src)) img.setAttribute("data-cid", src.slice(4).replace(/^<|>$/g, ""));
  }
  return doc.body.innerHTML;
};
