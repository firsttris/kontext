import { describe, expect, it, vi } from "vitest";
import { escapeHtml, htmlToText, mailDocument, sanitizeMailHtml, textToHtml } from "./html";
import { parseColor } from "./mail-colors";

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
  it("turns no cid: into a URL outside images and SVG", () => {
    const math = clean('<math><mtext href="cid:logo@x">x</mtext></math>').html;
    expect(math).not.toContain("href");
    expect(clean('<svg><image href="cid:logo@x"></image></svg>').html).toContain(
      'href="blob:logo"',
    );
  });
  it("keeps only allowed CSS images", () => {
    const style = `<div style="background:url('https://img.test/bg.png')">a</div><div style="background:url(javascript:alert(1))">b</div>`;
    expect(clean(style).html).not.toMatch(/url\(/);
    const allowed = clean(style, true).html;
    expect(allowed).toContain("url('https://img.test/bg.png')");
    expect(allowed).not.toContain("javascript");
  });
  it.each([
    '<img src="//t.test/p.png">',
    '<img src="\\\\t.test/p.png">',
    '<video poster="https://t.test/p.png"></video>',
    '<svg><image href="https://t.test/p.png"></image></svg>',
    '<svg><image xlink:href="https://t.test/p.png"></image></svg>',
    "<p>Hallo</p><style>body{background:url(https://t.test/p.png)}</style>",
    "<p>Hallo</p><style>@import 'https://t.test/a.css';</style>",
    `<div style="background-image: image-set('https://t.test/p.png' 1x)">x</div>`,
    `<div style="background:url('https://t.test/a(1).png')">x</div>`,
    `<div style="background:url('\\68ttps://t.test/p.png')">x</div>`,
    `<div style="background:\\75rl(https://t.test/p.png)">x</div>`,
    // A quote in a comment must not make the real address look like part of a string.
    `<div style="/*&quot;*/background-image:image-set('https://t.test/p.png' 1x)/*&quot;*/">x</div>`,
    `<p>Hallo</p><style>/*"*/@import 'https://t.test/a.css';/*"*/</style>`,
    // The URL parser drops tabs anywhere and C0 controls in front.
    `<div style="background-image:image-set('ht\\9tps://t.test/p.png' 1x)">x</div>`,
    `<div style="background-image:image-set('\\1 https://t.test/p.png' 1x)">x</div>`,
    `<p>Hallo</p><style>@import 'ht\\9tps://t.test/a.css';</style>`,
    // An escaped form feed continues a string; url( and strings left open at the end still count.
    `<div style="background-image:image-set('ht\\\ftps://t.test/ff.png' 1x)">x</div>`,
    `<div style="background-image:url(https://t.test/open.png">x</div>`,
    `<div style="background-image:url('https://t.test/open.png">x</div>`,
    `<p>x</p><style>p{background:url(https://t.test/open.png</style>`,
    // SVG presentation attributes are CSS too.
    `<svg><rect fill="url(https://t.test/p.svg#a)" mask="url(https://t.test/m.svg#m)"></rect></svg>`,
    `<svg><rect mask="image-set('https://t.test/m.png' 1x)"></rect></svg>`,
    `<svg><rect mask="-webkit-image-set('https://t.test/m.png' 1x)"></rect></svg>`,
    // An imported data: stylesheet would fetch again from inside.
    `<p>x</p><style>@import url("data:text/css,p{background:url(https://t.test/n.png)}");</style>`,
    `<p>x</p><style>@import "data:text/css,p{background:url(https://t.test/n.png)}";</style>`,
  ])("blocks and counts remote content in %s", (html) => {
    const { html: out, blockedImages } = clean(html);
    expect(out).not.toContain("t.test");
    expect(blockedImages).toBeGreaterThan(0);
  });
  it("reads escapes beyond Unicode as U+FFFD instead of failing", () => {
    expect(clean(`<p style="font-family:\\110000">x</p>`).blockedImages).toBe(0);
    expect(clean(`<style>p{content:"\\FFFFFF"}</style><p>x</p>`).blockedImages).toBe(0);
  });
  it("keeps local references in SVG and text that only mentions url", () => {
    const html = `<svg><rect fill="url(#a)"></rect></svg><img alt="url(x)" src="data:image/png;base64,AAAA"><blockquote cite="https://e.test/url(1)">q</blockquote>`;
    expect(clean(html)).toEqual({ html, blockedImages: 0 });
  });
  it("keeps embedded fonts and generated text while blocked", () => {
    const html = `<p class="x">Hallo</p><style>@font-face{font-family:B;src:url(data:font/woff2;base64,d09G) format("woff2")}.x::after{content:"https://weber-haustechnik.test"}</style>`;
    expect(clean(html)).toEqual({ html, blockedImages: 0 });
  });
  it("leaves attributes other than style as they were once allowed", () => {
    expect(clean(`<div id="url(x)" data-x="a&#12;b">t</div>`, true).html).toBe(
      `<div id="url(x)" data-x="a\fb">t</div>`,
    );
  });
  it("leaves text attributes as they were while blocked", () => {
    const html = `<div class="@import foo; bar" data-x="say &quot;http://x&quot;">t</div>`;
    expect(clean(html)).toEqual({ html, blockedImages: 0 });
  });
  it("keeps remote content once allowed", () => {
    const html = `<video poster="https://t.test/p.png"></video><style>p{background:url(https://t.test/s.png)}</style><div style="background:url('https://t.test/a(1).png')">x</div>`;
    expect(clean(html, true)).toEqual({ html, blockedImages: 0 });
  });
  it("keeps inline images and styles that fetch nothing", () => {
    const html = `<img src="data:image/png;base64,AAAA"><p style="font-family:'Geist'; color:red">x</p>`;
    expect(clean(html)).toEqual({ html, blockedImages: 0 });
    const css = `<p class="x">Hallo</p><style>.x{background:url(data:image/png;base64,AAAA)}</style>`;
    expect(clean(css)).toEqual({ html: css, blockedImages: 0 });
    expect(clean(`<p style="background:url(cid:logo@x)">x</p>`).html).toBe(
      '<p style="background:url(&quot;blob:logo&quot;)">x</p>',
    );
  });
});

describe("sanitizeMailHtml in the dark theme", () => {
  const dark = (html: string) =>
    sanitizeMailHtml(html, { allowRemote: false, cidUrls: {}, dark: true }).html;

  it("turns colours set for white paper around", () => {
    const html = dark(
      '<span style="font-size:10pt;color:black;background:white">Netzservice</span>' +
        '<font color="#000000">Text</font><table bgcolor="#ffffff"><tr><td>x</td></tr></table>',
    );
    expect(html).toContain("color: rgb(255, 255, 255)");
    expect(html).toContain("background: rgb(0, 0, 0)");
    expect(html).toContain("font-size: 10pt");
    expect(html).toContain('<font color="rgb(255, 255, 255)">');
    expect(html).toContain('bgcolor="rgb(0, 0, 0)"');
  });

  /** WCAG contrast of two colours as the browser writes them. */
  const contrast = (a: string, b: string) => {
    const luminance = (value: string) => {
      const { r, g, b: blue } = parseColor(value)!;
      const linear = (channel: number) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(blue);
    };
    const [light, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (light + 0.05) / (darker + 0.05);
  };

  /** Text and background of `selector` as the browser computes them in the cleaned mail. */
  const shown = (html: string, selector: string, paper = selector) => {
    const host = document.createElement("div");
    host.innerHTML = dark(html);
    document.body.append(host);
    const color = getComputedStyle(host.querySelector(selector)!).color;
    const background = getComputedStyle(host.querySelector(paper)!).backgroundColor;
    host.remove();
    return contrast(color, background);
  };

  it("keeps Outlook's highlight readable (black on yellow)", () => {
    expect(
      shown(
        '<span style="color:black;background:yellow;mso-highlight:yellow">Frist</span>',
        "span",
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps dark text readable on a card made white in the mail's <style>", () => {
    const html =
      '<div><style>.card { background: #ffffff; }</style><div class="card">' +
      '<span style="color:#333333">Text</span></div></div>';
    expect(shown(html, "span", ".card")).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves readable colours and the light theme alone", () => {
    const span = '<span style="color:#60a5fa;background:#2563eb">x</span>';
    expect(dark(span)).toBe(span);
    const black = '<span style="color:black">x</span>';
    expect(sanitizeMailHtml(black, { allowRemote: false, cidUrls: {} }).html).toBe(black);
  });
});

describe("mailDocument", () => {
  it("lets the frame fetch remote content only once allowed", () => {
    expect(mailDocument("", false)).toContain("img-src data: blob:;");
    expect(mailDocument("", false, true)).toContain("img-src data: blob: https: http:;");
  });

  it("keeps Outlook's lines together", () => {
    expect(mailDocument("", false)).toContain(".MsoNormal { margin: 0; }");
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
  it("keeps the brackets and quotes around a link out of it", () => {
    expect(textToHtml("Link: <https://example.com/a>")).toBe(
      '<p>Link: &lt;<a href="https://example.com/a">https://example.com/a</a>&gt;</p>',
    );
    expect(textToHtml('Link: "https://example.com/a"')).toBe(
      '<p>Link: &quot;<a href="https://example.com/a">https://example.com/a</a>&quot;</p>',
    );
    expect(textToHtml("Link: 'https://example.com/a'")).toContain('href="https://example.com/a"');
  });
  it("keeps an apostrophe inside a link", () => {
    expect(textToHtml("https://en.wikipedia.org/wiki/O'Brien")).toBe(
      '<p><a href="https://en.wikipedia.org/wiki/O&#39;Brien">https://en.wikipedia.org/wiki/O&#39;Brien</a></p>',
    );
  });
  it("keeps a query string with & in one link", () => {
    expect(textToHtml("(https://x.test/?a=1&b=2), ok")).toBe(
      '<p>(<a href="https://x.test/?a=1&amp;b=2">https://x.test/?a=1&amp;b=2</a>), ok</p>',
    );
  });
  it("turns HTML back into text", () => {
    expect(htmlToText("<p>Hallo</p><p>Welt<br>zwei</p>").trim()).toBe("Hallo\nWelt\nzwei");
    // A table as the editor writes it: a row per line, its cells apart by tabs.
    expect(
      htmlToText(
        "<p>Preise:</p><table><tbody><tr><th><p>Teil</p></th><th><p>Preis</p></th></tr>" +
          "<tr><td><p>Pumpe</p></td><td><p>240 €</p></td></tr></tbody></table><p>Gruß</p>",
      ),
    ).toBe("Preise:\nTeil\tPreis\nPumpe\t240 €\nGruß");
    // Parsed apart from the page: what it holds is only read.
    const created = vi.spyOn(document, "createElement");
    expect(htmlToText('<img src="x" onerror="alert(1)">Text')).toBe("Text");
    expect(created).not.toHaveBeenCalled();
  });
});
