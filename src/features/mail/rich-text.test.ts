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
});
