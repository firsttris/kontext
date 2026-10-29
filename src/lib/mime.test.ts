// @vitest-environment node
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import {
  contentPart,
  encodeWord,
  encryptedMail,
  mailbox,
  outerEnvelope,
  protectHeaders,
} from "./mime";

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

  it("an image in the text goes with the HTML as an inline part with its Content-ID", async () => {
    const part = contentPart(
      {
        text: "Foto",
        html: '<p><img src="cid:bild-1@kontext"></p>',
        attachments: [
          {
            name: "foto.png",
            type: "image/png",
            bytes: new Uint8Array([9, 8, 7]),
            cid: "bild-1@kontext",
          },
          { name: "Aufmaß.pdf", type: "application/pdf", bytes: new Uint8Array([1]) },
        ],
      },
      "y",
    );
    expect(part).toMatch(/multipart\/related/);
    const parsed = await PostalMime.parse(`Subject: t\r\nMIME-Version: 1.0\r\n${part}`);
    const image = parsed.attachments.find((file) => file.filename === "foto.png");
    expect(image?.contentId).toBe("<bild-1@kontext>");
    expect(image?.disposition).toBe("inline");
    expect(parsed.attachments.find((file) => file.filename === "Aufmaß.pdf")?.disposition).toBe(
      "attachment",
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

  it("names the parent once in References when it is already there (a reopened draft)", () => {
    const raw = encryptedMail(
      {
        from: { name: "Jonas Weber", email: "jonas@w.test" },
        to: [],
        cc: [],
        subject: "Re: Befund",
        date: new Date("2026-10-25T09:00:00Z"),
        messageId: "m2@w.test",
        inReplyTo: ["a@k.test"],
        references: ["start@k.test", "a@k.test"],
      },
      "-----BEGIN PGP MESSAGE-----\nxyz\n-----END PGP MESSAGE-----",
      "e2",
    );
    expect(raw).toContain("References: <start@k.test> <a@k.test>\r\n");
  });

  it("encodes names and words only where needed", () => {
    expect(encodeWord("Angebot")).toBe("Angebot");
    expect(encodeWord("Grüße")).toMatch(/^=\?UTF-8\?B\?/);
    expect(mailbox({ name: "Weber, Jonas", email: "j@w.test" })).toBe('"Weber, Jonas" <j@w.test>');
    expect(mailbox({ name: null, email: "j@w.test" })).toBe("<j@w.test>");
    expect(mailbox({ name: 'IT\\Admin "Weber"', email: "j@w.test" })).toBe(
      '"IT\\\\Admin \\"Weber\\"" <j@w.test>',
    );
  });

  it("keeps every encoded-word within 75 characters (RFC 2047 §2) and reads back whole", async () => {
    const subject = "Rückfrage zur Rechnung über die Heizungsanlage im Büro – bitte prüfen 🔧ÄÖÜß";
    const name = "Jürgen Müller-Lüdenscheidt Größenwahn Hausverwaltung Süd 🏠 GmbH & Co. KG";
    const encoded = encodeWord(subject);
    const words = encoded.split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(word.length).toBeLessThanOrEqual(75);
    }
    const raw = encryptedMail(
      {
        from: { name, email: "j@w.test" },
        to: [{ name, email: "p@k.test" }],
        cc: [],
        subject,
        date: new Date("2026-10-25T09:00:00Z"),
        messageId: "m2@w.test",
      },
      "-----BEGIN PGP MESSAGE-----\nxyz\n-----END PGP MESSAGE-----",
      "e2",
    );
    const parsed = await PostalMime.parse(raw);
    expect(parsed.subject).toBe(subject);
    expect(parsed.from?.name).toBe(name);
    expect(parsed.to?.[0]?.name).toBe(name);
    expect(parsed.to?.[0]?.address).toBe("p@k.test");
  });

  it("puts the subject inside, marked as protected, and hides it outside", async () => {
    const mail = {
      from: { name: "Jonas", email: "jonas@w.test" },
      to: [{ name: null, email: "petra@k.test" }],
      cc: [],
      subject: "Kündigung Müller",
      date: new Date("2026-10-25T08:00:00Z"),
      messageId: "m1@w.test",
    };
    const inner = protectHeaders(
      contentPart({ text: "x", html: "<p>x</p>", attachments: [] }, "p1"),
      mail,
    );
    expect(inner.split("\r\n")[0]).toMatch(
      /^Content-Type: multipart\/alternative; .*protected-headers="v1"$/,
    );
    const parsed = await PostalMime.parse(`MIME-Version: 1.0\r\n${inner}`);
    expect(parsed.subject).toBe("Kündigung Müller");
    expect(parsed.text?.trim()).toBe("x");
    expect(outerEnvelope(mail).subject).toBe("Vertrauliche Nachricht");
  });
});
