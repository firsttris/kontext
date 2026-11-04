/**
 * An .mbox file (RFC 4155) as single mails, read piece by piece so that a Google Takeout of
 * several GB never sits in memory: each mail starts after a "From " line, and a body line that
 * began with "From " was written as ">From " (mboxrd: one ">" more per level), which is undone.
 * The flags the exporters leave in the header (Gmail, Thunderbird, mutt and Apple's mail) become
 * JMAP keywords (RFC 8621 §4.1.1).
 */
import { headerValue } from "./eml-import";

/** How much of a file is read at once. */
const PIECE = 4 * 1024 * 1024;

/** The file in pieces, by `slice`, which every browser and Bun know. */
export async function* blobPieces(blob: Blob, size = PIECE): AsyncGenerator<Uint8Array> {
  for (let start = 0; start < blob.size; start += size) {
    yield new Uint8Array(await blob.slice(start, start + size).arrayBuffer());
  }
}

const LF = 10;
const FROM_LINE = [...new TextEncoder().encode("From ")];

/** Whether `line` starts with `>` × `quotes` and then "From ". */
const isFrom = (line: Uint8Array, quotes: number) =>
  line.length >= quotes + FROM_LINE.length &&
  line.subarray(0, quotes).every((byte) => byte === 0x3e) &&
  FROM_LINE.every((byte, index) => line[quotes + index] === byte);

const isEscapedFrom = (line: Uint8Array) => {
  let quotes = 0;
  while (line[quotes] === 0x3e) quotes += 1;
  return quotes > 0 && isFrom(line, quotes);
};

const isBlank = (line: Uint8Array) =>
  line.length === 1 || (line.length === 2 && line[0] === 13 && line[1] === LF);

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return all;
};

/** One mail from its lines; the blank line before the next "From " belongs to the mbox. */
const joined = (lines: Uint8Array[]) =>
  concat(lines.length && isBlank(lines[lines.length - 1]!) ? lines.slice(0, -1) : lines);

/** The file's lines, each with its line end. */
async function* linesOf(pieces: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  let rest = new Uint8Array(0);
  for await (const piece of pieces) {
    const data = rest.length ? concat([rest, piece]) : piece;
    let start = 0;
    for (let end = data.indexOf(LF); end !== -1; end = data.indexOf(LF, start)) {
      yield data.subarray(start, end + 1);
      start = end + 1;
    }
    rest = data.slice(start);
  }
  if (rest.length) yield rest;
}

/** The mails of an mbox, in order; anything before the first "From " line is no mail. */
export async function* splitMbox(
  pieces: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  let lines: Uint8Array[] | undefined;
  for await (const line of linesOf(pieces)) {
    if (isFrom(line, 0)) {
      if (lines?.length) yield joined(lines);
      lines = [];
    } else if (lines) {
      lines.push(isEscapedFrom(line) ? line.subarray(1) : line);
    }
  }
  if (lines?.length) yield joined(lines);
}

export type MboxFlags = { deleted: boolean; keywords: Record<string, true> };

/** Thunderbird's X-Mozilla-Status bits (comm-central mailnews/base/public/nsMsgMessageFlags.idl). */
const MOZILLA = { read: 0x1, replied: 0x2, marked: 0x4, expunged: 0x8 };

const keywordsOf = (seen: boolean, flagged: boolean, answered: boolean) => ({
  ...(seen ? { $seen: true as const } : {}),
  ...(flagged ? { $flagged: true as const } : {}),
  ...(answered ? { $answered: true as const } : {}),
});

/**
 * Read, flagged and answered from the header of one mail, and whether Thunderbird had deleted it
 * without compacting the folder yet. A mail without any of these headers counts as read, like an
 * imported .eml.
 */
export const mboxFlags = (head: string): MboxFlags => {
  const gmail = headerValue(head, "x-gmail-labels");
  if (gmail) {
    const labels = gmail.split(",").map((label) => label.trim().toLowerCase());
    const keywords = keywordsOf(!labels.includes("unread"), labels.includes("starred"), false);
    return { deleted: false, keywords };
  }
  const mozilla = headerValue(head, "x-mozilla-status");
  if (mozilla && /^[0-9a-f]{1,4}$/i.test(mozilla)) {
    const bits = Number.parseInt(mozilla, 16);
    const has = (bit: number) => (bits & bit) !== 0;
    const keywords = keywordsOf(has(MOZILLA.read), has(MOZILLA.marked), has(MOZILLA.replied));
    return { deleted: has(MOZILLA.expunged), keywords };
  }
  const status = headerValue(head, "status");
  const extra = headerValue(head, "x-status") ?? "";
  if (status === undefined && !extra) return { deleted: false, keywords: { $seen: true } };
  const keywords = keywordsOf(
    (status ?? "").includes("R"),
    extra.includes("F"),
    extra.includes("A"),
  );
  return { deleted: extra.includes("D"), keywords };
};
