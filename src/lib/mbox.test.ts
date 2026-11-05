import { describe, expect, it } from "vitest";
import { blobPieces, mboxEntry, mboxFlags, splitMbox } from "./mbox";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The text as pieces of `size` bytes, cut anywhere, also inside a line. */
async function* piecesOf(text: string, size: number) {
  const bytes = encoder.encode(text);
  for (let start = 0; start < bytes.length; start += size)
    yield bytes.subarray(start, start + size);
}

const mails = async (text: string, size = 7) => {
  const found: string[] = [];
  for await (const mail of splitMbox(piecesOf(text, size))) found.push(decoder.decode(mail));
  return found;
};

const MBOX = [
  "From 1767052800@xxx Tue Mar 04 08:15:00 +0000 2025",
  "From: Petra <petra@keller.test>",
  "Subject: Angebot",
  "",
  "Hallo,",
  ">From the start, ein Satz.",
  ">>From quoted",
  "> From bleibt",
  "",
  "From MAILER-DAEMON Wed Mar 05 10:00:00 2025",
  "Subject: Zweite",
  "",
  "Ende",
  "",
].join("\n");

describe("splitMbox", () => {
  it("splits on From lines, unescapes >From and drops the separating blank line", async () => {
    for (const size of [1, 7, 4096]) {
      expect(await mails(MBOX, size)).toEqual([
        [
          "From: Petra <petra@keller.test>",
          "Subject: Angebot",
          "",
          "Hallo,",
          "From the start, ein Satz.",
          ">From quoted",
          "> From bleibt",
          "",
        ].join("\n"),
        "Subject: Zweite\n\nEnde\n",
      ]);
    }
  });

  it("keeps CRLF line ends and a last mail without a line end", async () => {
    expect(await mails("From a\r\nSubject: x\r\n\r\nText\r\n\r\nFrom b\r\nSubject: y")).toEqual([
      "Subject: x\r\n\r\nText\r\n",
      "Subject: y",
    ]);
  });

  it("keeps a last line of one character when the file does not end in a line end", async () => {
    expect(await mails("From a\nSubject: x\n\nGruss\n-")).toEqual(["Subject: x\n\nGruss\n-"]);
    expect(await mails("From a\r\nSubject: x\r\n\r\ny")).toEqual(["Subject: x\r\n\r\ny"]);
  });

  it("finds nothing in a file that is no mbox", async () => {
    expect(await mails("Subject: x\n\nFrom-Zeile nicht\n")).toEqual([]);
  });

  it("reads a Blob in pieces", async () => {
    const found: string[] = [];
    for await (const mail of splitMbox(blobPieces(new Blob([MBOX]), 5))) {
      found.push(decoder.decode(mail));
    }
    expect(found).toHaveLength(2);
  });
});

describe("mboxFlags", () => {
  const head = (...lines: string[]) => `${lines.join("\n")}\nSubject: x\n\nX-Status: D\n`;

  it("reads Gmail's labels from Google Takeout", () => {
    expect(mboxFlags(head("X-Gmail-Labels: Posteingang,Opened,Starred"))).toEqual({
      deleted: false,
      keywords: { $seen: true, $flagged: true },
    });
    expect(mboxFlags(head("X-Gmail-Labels: Inbox,Unread,Category Updates"))).toEqual({
      deleted: false,
      keywords: {},
    });
  });

  it("reads Thunderbird's status bits, and its deleted mails", () => {
    expect(mboxFlags(head("X-Mozilla-Status: 0007"))).toEqual({
      deleted: false,
      keywords: { $seen: true, $flagged: true, $answered: true },
    });
    expect(mboxFlags(head("X-Mozilla-Status: 0000"))).toEqual({ deleted: false, keywords: {} });
    expect(mboxFlags(head("X-Mozilla-Status: 0009")).deleted).toBe(true);
  });

  it("reads Status and X-Status (mutt, Apple Mail)", () => {
    expect(mboxFlags(head("Status: RO", "X-Status: AF"))).toEqual({
      deleted: false,
      keywords: { $seen: true, $flagged: true, $answered: true },
    });
    expect(mboxFlags(head("Status: O"))).toEqual({ deleted: false, keywords: {} });
  });

  it("takes a mail without status headers as read; the body does not count", () => {
    expect(mboxFlags(head("From: a@b.test"))).toEqual({
      deleted: false,
      keywords: { $seen: true },
    });
  });
});

describe("mboxEntry", () => {
  const receivedAt = new Date("2026-11-05T09:04:00Z");
  const FIRST = "Subject: Angebot\r\n\r\nFrom the start\r\n>From quoted\r\n> From bleibt\r\n";
  const SECOND = "Subject: Zweite\n\nFrom here\nEnde";

  const written = async () => {
    const entries = [
      mboxEntry(encoder.encode(FIRST), {
        sender: "petra@keller.test",
        receivedAt,
        keywords: { $seen: true, $flagged: true, $answered: true },
      }),
      mboxEntry(encoder.encode(SECOND), { sender: "", receivedAt, keywords: {} }),
    ];
    return new Blob(entries.flat() as BlobPart[]);
  };

  it("writes From lines and mboxrd escapes in the mail's line ends", async () => {
    const text = await (await written()).text();
    expect(text).toBe(
      "From petra@keller.test Thu Nov  5 09:04:00 2026\r\nStatus: RO\r\nX-Status: FA\r\n" +
        "Subject: Angebot\r\n\r\n>From the start\r\n>>From quoted\r\n> From bleibt\r\n\r\n" +
        "From MAILER-DAEMON Thu Nov  5 09:04:00 2026\nStatus: O\n" +
        "Subject: Zweite\n\n>From here\nEnde\n\n",
    );
  });

  it("reads back with splitMbox and mboxFlags as it was", async () => {
    const found: string[] = [];
    for await (const mail of splitMbox(blobPieces(await written(), 9))) {
      found.push(decoder.decode(mail));
    }
    expect(found).toEqual([`Status: RO\r\nX-Status: FA\r\n${FIRST}`, `Status: O\n${SECOND}\n`]);
    expect(found.map((mail) => mboxFlags(mail).keywords)).toEqual([
      { $seen: true, $flagged: true, $answered: true },
      {},
    ]);
  });
});

describe("mboxEntry over flag headers the mail already carries", () => {
  const receivedAt = new Date("2026-11-05T09:04:00Z");
  const readBack = async (raw: string, keywords: Record<string, boolean>) => {
    const parts = mboxEntry(encoder.encode(raw), { sender: "", receivedAt, keywords });
    for await (const mail of splitMbox(blobPieces(new Blob(parts as BlobPart[])))) {
      return { mail: decoder.decode(mail), flags: mboxFlags(decoder.decode(mail)) };
    }
    throw new Error("no mail");
  };

  it("reads back the flags of now, not those of an earlier Gmail export", async () => {
    // Imported from a Google Takeout while unread and starred, then read and unstarred here.
    const raw = "X-Gmail-Labels: Posteingang,Unread,Starred\r\nSubject: A\r\n\r\nText\r\n";
    const { flags } = await readBack(raw, { $seen: true });
    expect(flags).toEqual({ deleted: false, keywords: { $seen: true } });
  });

  it("reads back the flags of now, not those of an earlier mutt or Thunderbird mbox", async () => {
    const raw =
      "Status: O\nX-Status: FD\nX-Mozilla-Status: 0004\nX-Mozilla-Status2:\n 00000000\n" +
      "Subject: B\n\nStatus: im Text bleibt\n";
    const { mail, flags } = await readBack(raw, { $seen: true, $answered: true });
    expect(flags).toEqual({ deleted: false, keywords: { $seen: true, $answered: true } });
    expect(mail).toBe("Status: RO\nX-Status: A\nSubject: B\n\nStatus: im Text bleibt\n");
  });
});
