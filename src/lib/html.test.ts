import { describe, expect, it } from "vitest";
import { escapeHtml, htmlToText, sanitizeMailHtml, textToHtml } from "./html";

const clean = (html: string, allowRemote = false) =>
  sanitizeMailHtml(html, { allowRemote, cidUrls: { "logo@x": "blob:logo" } });

describe("sanitizeMailHtml", () => {
  it("removes scripts, event handlers and active content", () => {
    const { html } = clean(`
      <script>alert(1)</script>
      <img src="x" onerror="alert(2)">
      <svg onload="alert(3)"><circle r="5"></circle></svg>
      <a href="javascript:alert(4)">Rechnung</a>
      <iframe src="https://evil.test"></iframe>
      <object data="x"></object><embed src="x">
      <form action="https://phish.test"><input name="pw"><button>OK</button></form>
      <meta http-equiv="refresh" content="0;url=https://phish.test">
      <base href="https://phish.test/">
      <p>Betrag</p>`);
    expect(html).not.toMatch(/<script|onerror|onload|javascript:|<iframe|<object|<embed/i);
    expect(html).not.toMatch(/<form|<input|<button|<meta|<base/i);
    expect(html).toContain("<p>Betrag</p>");
    expect(html).toContain(">Rechnung</a>");
  });
  it("opens links in a new tab without the opener", () => {
    expect(clean('<a href="https://x.test">x</a>').html).toContain(
      'target="_blank" rel="noopener noreferrer"',
    );
  });
  it("blocks remote images until allowed and counts them", () => {
    const html = '<img src="https://img.test/a.png"><img src="http://img.test/b.gif">';
    expect(clean(html)).toEqual({ html: "<img><img>", blockedImages: 2 });
    expect(clean(html, true).html).toContain('src="https://img.test/a.png"');
  });
  it("shows inline images from the mail itself", () => {
    expect(clean('<img src="cid:logo@x">').html).toBe('<img src="blob:logo">');
    expect(clean('<img src="cid:unknown">').html).toBe("<img>");
  });
  it("keeps only allowed CSS images", () => {
    const style = `<div style="background:url('https://img.test/bg.png')">a</div><div style="background:url(javascript:alert(1))">b</div>`;
    expect(clean(style).html).not.toMatch(/url\(/);
    const allowed = clean(style, true).html;
    expect(allowed).toContain("url('https://img.test/bg.png')");
    expect(allowed).not.toContain("javascript");
  });
});

describe("text and HTML", () => {
  it("escapes and links plain text", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
    expect(textToHtml("Hallo\nWelt\n\nSiehe https://x.test/a.")).toBe(
      '<p>Hallo<br>Welt</p><p>Siehe <a href="https://x.test/a">https://x.test/a</a>.</p>',
    );
  });
  it("turns HTML back into text", () => {
    expect(htmlToText("<p>Hallo</p><p>Welt<br>zwei</p>").trim()).toBe("Hallo\nWelt\nzwei");
  });
});
