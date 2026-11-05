/**
 * A ZIP file of files as they are, without compression ("stored", method 0): what "Alle
 * herunterladen" hands over. Attachments are mostly PDFs, photos and Office files, which are
 * compressed already, so deflating them again gains little; storing needs no library.
 *
 * Layout after APPNOTE.TXT (PKWARE, 6.3.10): a local header and the data per file, then the
 * central directory and its end record. Names are UTF-8 (general purpose bit 11). No ZIP64, so
 * the whole file stays below 4 GiB and 65,535 files – far beyond what one mail can carry.
 */

export type ZipEntry = { name: string; data: Uint8Array };

const UTF8_NAMES = 0x0800;
const VERSION = 20;

let table: Uint32Array | undefined;

/** CRC-32 as ZIP uses it (polynomial 0xEDB88320, APPNOTE 4.4.7). */
export const crc32 = (data: Uint8Array): number => {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of data) crc = (table[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** MS-DOS date and time, as ZIP stores them (two-second steps, from 1980). */
const dosDateTime = (now: Date) => ({
  time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
  date: (Math.max(now.getFullYear() - 1980, 0) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
});

type Field = [size: 2 | 4, value: number];

/** Little-endian fields of 2 or 4 bytes. */
const record = (fields: Field[]): Uint8Array => {
  const bytes = new Uint8Array(fields.reduce((sum, [size]) => sum + size, 0));
  const view = new DataView(bytes.buffer);
  let at = 0;
  for (const [size, value] of fields) {
    if (size === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += size;
  }
  return bytes;
};

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** The ZIP file holding these entries, stored as they are, dated `now`. */
export const zipStored = (entries: ZipEntry[], now = new Date()): Uint8Array<ArrayBuffer> => {
  const { time, date } = dosDateTime(now);
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const encoded = new TextEncoder().encode(name);
    const size = data.length;
    // Both headers share these, from "version needed" to the extra field's length (APPNOTE 4.3.7).
    const common: Field[] = [
      ...([VERSION, UTF8_NAMES, 0, time, date].map((value) => [2, value]) as Field[]),
      [4, crc32(data)],
      [4, size],
      [4, size],
      [2, encoded.length],
      [2, 0],
    ];
    const header = record([[4, 0x04034b50], ...common]);
    local.push(header, encoded, data);
    // Then comment length, disk, internal and external attributes, and where the header is.
    const tail: Field[] = [
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, offset],
    ];
    central.push(record([[4, 0x02014b50], [2, VERSION], ...common, ...tail]), encoded);
    offset += header.length + encoded.length + size;
  }
  const directory = concat(central);
  const count = entries.length;
  const end = record([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, count],
    [2, count],
    [4, directory.length],
    [4, offset],
    [2, 0],
  ]);
  return concat([...local, directory, end]);
};

/**
 * Names that differ, as the files keep them on disk: a second "Rechnung.pdf" becomes
 * "Rechnung (2).pdf". Compared without case, as Windows and macOS do.
 */
export const uniqueNames = (names: string[]): string[] => {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      candidate = `${stem} (${n})${extension}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
};
