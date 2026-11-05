import { describe, expect, it } from "vitest";
import { decodeText, detectSeparator, parseCsv } from "./csv";

describe("decodeText", () => {
  it("reads UTF-8 and drops the BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Müller")]);
    expect(decodeText(bytes)).toBe("Müller");
  });

  it("falls back to Windows-1252, as Excel saves in Germany", () => {
    expect(decodeText(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x80]))).toBe("Müller€");
  });

  it("reads UTF-16 with its BOM, as Excel saves Unicode text", () => {
    const text = "Vorname\tNachname\r\nJürgen\tGroß €";
    const le = [0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])];
    const be = [0xfe, 0xff, ...[...text].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff])];
    expect(decodeText(new Uint8Array(le))).toBe(text);
    expect(decodeText(new Uint8Array(be))).toBe(text);
  });
});

describe("detectSeparator", () => {
  it("takes the separator of the first line, outside quotes", () => {
    expect(detectSeparator("Vorname;Nachname;Ort\nA,B;C;D")).toBe(";");
    expect(detectSeparator('"Last; Name",First Name,E-mail Address\n')).toBe(",");
    expect(detectSeparator("a\tb\tc")).toBe("\t");
  });
});

describe("parseCsv", () => {
  it("reads quoted fields with separators, quotes and line breaks", () => {
    const text = 'Name;Notiz\r\n"Weber; Jonas";"sagt ""Moin""\r\nund tschüss"\r\n\r\nAnna;\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Notiz"],
      ["Weber; Jonas", 'sagt "Moin"\r\nund tschüss'],
      ["Anna", ""],
    ]);
  });

  it("keeps the last row without a final line break", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("leaves out empty rows, also those of separators only", () => {
    expect(parseCsv("a;b\n;\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
