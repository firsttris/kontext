import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { richText } from "./rich-text";

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

const write = (content: string) => {
  editor = new Editor({ extensions: richText(), content });
  return editor;
};

describe("richText", () => {
  it("writes size and colours as inline styles, which every mail program shows", () => {
    const e = write("<p>Dringend</p>");
    e.chain()
      .selectAll()
      .setFontSize("18px")
      .setColor("#dc2626")
      .setBackgroundColor("#fef08a")
      .run();
    const html = e.getHTML();
    expect(html).toContain("font-size: 18px");
    // jsdom writes colours as rgb(), a browser may keep the hex; mail programs take both.
    expect(html).toMatch(/[^-]color: (#dc2626|rgb\(220, 38, 38\))/);
    expect(html).toMatch(/background-color: (#fef08a|rgb\(254, 240, 138\))/);
  });

  it("gives a table its lines and spacing inline", () => {
    const e = write("<p></p>");
    e.chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    const html = e.getHTML();
    const border = /border: ?1px solid (#d4d4d8|rgb\(212, 212, 216\))/;
    expect(html).toMatch(/<table style="[^"]*border-collapse: ?collapse/);
    const th = html.match(/<th [^>]*>/)?.[0] ?? "";
    expect(th).toMatch(border);
    expect(th).toMatch(/font-weight: ?600/);
    expect(html.match(/<td [^>]*>/)?.[0]).toMatch(border);
  });

  it("keeps a table and colours from a mail it is given (a reply's quote, a signature)", () => {
    const e = write(
      '<table><tbody><tr><td><p><span style="color: #2563eb">blau</span></p></td></tr></tbody></table>',
    );
    expect(e.getHTML()).toContain("<table");
    expect(e.getHTML()).toMatch(/color: (#2563eb|rgb\(37, 99, 235\))/);
  });

  it("leaves a quoted mail's layout table as it looks: no lines added, its own colours kept", () => {
    const e = write(
      '<blockquote><table border="0"><tbody><tr>' +
        '<td style="padding: 0px; background: rgb(0, 51, 102);"><p>Logo</p></td>' +
        "<td><p>Weber Haustechnik</p></td></tr></tbody></table></blockquote>",
    );
    const html = e.getHTML();
    expect(html).not.toMatch(/border: ?1px solid/);
    expect(html).toMatch(/<td style="[^"]*background: rgb\(0, 51, 102\)/);
  });

  it("keeps the lines of a table written here when the draft is opened again", () => {
    const e = write("<p></p>");
    e.chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    const reopened = write(e.getHTML()).getHTML();
    expect(reopened.match(/<td [^>]*>/)?.[0]).toMatch(/border: ?1px solid/);
    expect(reopened.match(/<th [^>]*>/)?.[0]).toMatch(/font-weight: ?600/);
  });
});

describe("richText with images", () => {
  it("keeps a picture's Content-ID and the size it was given", () => {
    editor = new Editor({
      extensions: richText({ images: true }),
      content: '<p>Foto: <img src="blob:http://x/1" data-cid="bild-1@kontext" width="240"></p>',
    });
    const img = editor.getHTML().match(/<img [^>]*>/)?.[0] ?? "";
    expect(img).toContain('data-cid="bild-1@kontext"');
    expect(img).toContain('width="240"');
    expect(img).toContain("max-width");
  });

  it("has no pictures where they are not offered (signatures)", () => {
    editor = new Editor({ extensions: richText(), content: '<p><img src="blob:http://x/1"></p>' });
    expect(editor.getHTML()).not.toContain("<img");
  });
});
