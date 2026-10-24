import { describe, expect, it } from "vitest";
import { simplePdf } from "./pdf";

const pdf = simplePdf({
  letterhead: "Keller Elektro GmbH",
  colour: [0.1, 0.3, 0.6],
  lines: [{ text: "Angebot (Wartung) für Halle 2", bold: true }],
});
const text = Buffer.from(pdf).toString("latin1");

describe("simplePdf", () => {
  it("is a PDF whose cross-reference table points at each object", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref).startsWith("xref")).toBe(true);
  });

  it("writes umlauts as one byte and escapes brackets", () => {
    expect(text).toContain("(Angebot \\(Wartung\\) für Halle 2)");
    expect(pdf.includes(0xfc)).toBe(true);
  });
});
