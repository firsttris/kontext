import { describe, expect, it } from "vitest";
import { crc32, uniqueNames, zipStored } from "./zip";

const text = (value: string) => new TextEncoder().encode(value);

/** Reads a ZIP the way unzip does: from the end record through the central directory. */
const readZip = (zip: Uint8Array) => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  expect(at + view.getUint32(end + 12, true)).toBe(end);
  return Array.from({ length: count }, () => {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength;
    // The local header says the same, and the data follows it.
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint32(local + 14, true)).toBe(crc);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = zip.slice(start, start + size);
    expect(crc32(data)).toBe(crc);
    return { name, flags, method, data: new TextDecoder().decode(data) };
  });
};

describe("crc32", () => {
  it("matches the check value of CRC-32/ISO-HDLC", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(text("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });
});

describe("zipStored", () => {
  it("holds each file as it is, under its UTF-8 name", () => {
    const zip = zipStored([
      { name: "Lieferschein-48211.pdf", data: text("%PDF-1.4 …") },
      { name: "Datenblatt Förderhöhe.txt", data: text("Förderhöhe max. 6 m") },
      { name: "leer", data: new Uint8Array() },
    ]);
    expect(readZip(zip)).toEqual([
      { name: "Lieferschein-48211.pdf", flags: 0x0800, method: 0, data: "%PDF-1.4 …" },
      { name: "Datenblatt Förderhöhe.txt", flags: 0x0800, method: 0, data: "Förderhöhe max. 6 m" },
      { name: "leer", flags: 0x0800, method: 0, data: "" },
    ]);
  });

  it("dates the files in MS-DOS time", () => {
    const zip = zipStored([{ name: "a", data: text("a") }], new Date(2026, 10, 5, 14, 30, 59));
    const view = new DataView(zip.buffer);
    expect(view.getUint16(10, true)).toBe((14 << 11) | (30 << 5) | 29);
    expect(view.getUint16(12, true)).toBe((46 << 9) | (11 << 5) | 5);
  });

  it("is an empty archive without files", () => {
    expect(zipStored([])).toEqual(
      new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)]),
    );
  });
});

describe("uniqueNames", () => {
  it("numbers a name that came before, before its extension", () => {
    expect(uniqueNames(["Rechnung.pdf", "rechnung.PDF", "Rechnung.pdf", "Foto"])).toEqual([
      "Rechnung.pdf",
      "rechnung (2).PDF",
      "Rechnung (3).pdf",
      "Foto",
    ]);
  });

  it("skips a number another file already has", () => {
    expect(uniqueNames(["a (2).txt", "a.txt", "a.txt", "Foto", "Foto", ".profile"])).toEqual([
      "a (2).txt",
      "a.txt",
      "a (3).txt",
      "Foto",
      "Foto (2)",
      ".profile",
    ]);
  });
});
