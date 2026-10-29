import { describe, expect, it } from "vitest";
import { winmailDat } from "../../dev/tnef";
import { isTnef, tnefFiles } from "./tnef";

const bytes = (text: string) => new TextEncoder().encode(text);
const read = (data: Uint8Array) => new TextDecoder().decode(data);

describe("tnefFiles", () => {
  it("takes the files out with their long name and type", () => {
    const files = tnefFiles(
      winmailDat([
        {
          shortName: "RECHNU~1.PDF",
          longName: "Rechnung März 2026.pdf",
          type: "application/pdf",
          data: bytes("%PDF-1.4 Rechnung"),
        },
        { shortName: "notiz.txt", data: bytes("Notiz") },
      ]),
    );
    expect(files?.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: "Rechnung März 2026.pdf", type: "application/pdf" },
      { name: "notiz.txt", type: "application/octet-stream" },
    ]);
    expect(read(files![0]!.data)).toBe("%PDF-1.4 Rechnung");
    expect(read(files![1]!.data)).toBe("Notiz");
  });

  it("leaves out an embedded Outlook item", () => {
    const dat = winmailDat([
      { shortName: "Weitergeleitet", data: new Uint8Array([1, 2, 3]), embedded: true },
    ]);
    expect(tnefFiles(dat)).toEqual([]);
  });

  it("is null for what is no TNEF or breaks off", () => {
    expect(tnefFiles(bytes("kein TNEF"))).toBeNull();
    const whole = winmailDat([{ shortName: "a.txt", data: bytes("abc") }]);
    expect(tnefFiles(whole.subarray(0, whole.length - 5))).toBeNull();
  });
});

describe("isTnef", () => {
  it("knows winmail.dat by type or name", () => {
    expect(isTnef("application/ms-tnef", "winmail.dat")).toBe(true);
    expect(isTnef("application/vnd.ms-tnef", null)).toBe(true);
    expect(isTnef("application/octet-stream", "WINMAIL.DAT")).toBe(true);
    expect(isTnef("application/pdf", "winmail.pdf")).toBe(false);
  });
});
