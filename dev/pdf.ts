/**
 * Real one-page PDFs for the seed, so attachment previews have something to draw: a coloured
 * letterhead, a title and lines of text in Helvetica (PDF 1.4, ISO 32000-1 §7.5 file structure).
 * Text is WinAnsi, so German umlauts work; the file is returned as bytes. No Node APIs: the demo
 * (src/demo) builds the same files in the browser.
 */

export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number };

const pdfString = (text: string) => text.replace(/[\\()]/g, "\\$&");

/** Latin-1: one character is one byte. */
const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

export const simplePdf = ({
  letterhead,
  colour,
  lines,
}: {
  letterhead: string;
  /** RGB 0–1 of the letterhead bar. */
  colour: [number, number, number];
  lines: PdfLine[];
}): Uint8Array => {
  let y = 740;
  const text = lines.map(({ text, size = 11, bold = false, gap = 0 }) => {
    y -= gap;
    const op = `BT /${bold ? "F2" : "F1"} ${size} Tf 56 ${y} Td (${pdfString(text)}) Tj ET`;
    y -= size * 1.55;
    return op;
  });
  const content = [
    `${colour.join(" ")} rg 0 782 595 60 re f`,
    `1 1 1 rg BT /F2 18 Tf 56 805 Td (${pdfString(letterhead)}) Tj ET`,
    "0.1 0.1 0.12 rg",
    ...text,
    "0.85 0.85 0.87 RG 56 90 m 539 90 l S",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`,
  ];
  // Latin-1: one character is one byte, so string lengths are byte offsets.
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(pdf);
};
