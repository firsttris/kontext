/**
 * CSV files as Excel, Outlook and Google write them (RFC 4180 quoting). Excel in Germany saves
 * Windows-1252 with ";" between the fields, Outlook and Google UTF-8 with ",". Pure.
 */

/** UTF-8 when the bytes are valid UTF-8 (a BOM is dropped), otherwise Windows-1252. */
export const decodeText = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

const SEPARATORS = [";", ",", "\t"] as const;

/** The separator found most often in the first line, outside quotes. */
export const detectSeparator = (text: string): string => {
  const counts = new Map<string, number>(SEPARATORS.map((s) => [s, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  return [...counts].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
};

/** The rows of the file; a quoted field may hold the separator, `""` and line breaks. */
export const parseCsv = (text: string, separator = detectSeparator(text)): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === separator) endField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += char;
  }
  if (field || row.length) endRow();
  return rows;
};
