// @vitest-environment node
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { contentPart, encodeWord, encryptedMail, mailbox } from "./mime";

describe("MIME built in the app", () => {
  it("a content part a mail program reads back: text, HTML, an attachment with umlauts", async () => {
    const part = contentPart(
      {
        text: "Grüße\nZeile 2",
        html: "<p>Grüße</p>",
        attachments: [
          { name: "Aufmaß.pdf", type: "application/pdf", bytes: new Uint8Array([1, 2, 3]) },
        ],
      },
      "x",
    );
    const parsed = await PostalMime.parse(`Subject: t\r\nMIME-Version: 1.0\r\n${part}`);
    expect(parsed.text?.replace(/\r\n/g, "\n").trim()).toBe("Grüße\nZeile 2");
    expect(parsed.html).toContain("<p>Grüße</p>");
    expect(parsed.attachments[0]?.filename).toBe("Aufmaß.pdf");
    expect(new Uint8Array(parsed.attachments[0]!.content as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("the PGP/MIME envelope with its headers", async () => {
    const raw = encryptedMail(
      {
        from: { name: "Jonas Weber", email: "jonas@w.test" },
        to: [{ name: "Petra Keller", email: "petra@k.test" }],
        cc: [],
        subject: "Befund Müller",
        date: new Date("2026-10-25T09:00:00Z"),
        messageId: "m1@w.test",
        inReplyTo: ["a@k.test"],
      },
      "-----BEGIN PGP MESSAGE-----\nxyz\n-----END PGP MESSAGE-----",
      "e1",
    );
    expect(raw).toContain(
      'Content-Type: multipart/encrypted; boundary="enc-e1"; protocol="application/pgp-encrypted"',
    );
    expect(raw).toContain("Version: 1");
    expect(raw).toContain("References: <a@k.test>");
    const parsed = await PostalMime.parse(raw);
    expect(parsed.subject).toBe("Befund Müller");
    expect(parsed.to?.[0]?.address).toBe("petra@k.test");
  });

  it("encodes names and words only where needed", () => {
    expect(encodeWord("Angebot")).toBe("Angebot");
    expect(encodeWord("Grüße")).toMatch(/^=\?UTF-8\?B\?/);
    expect(mailbox({ name: "Weber, Jonas", email: "j@w.test" })).toBe('"Weber, Jonas" <j@w.test>');
    expect(mailbox({ name: null, email: "j@w.test" })).toBe("<j@w.test>");
  });
});
