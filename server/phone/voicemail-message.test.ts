// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeWav } from "./sounds";
import { encodeWord, voicemailMessage } from "./voicemail-message";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("voicemailMessage", () => {
  const wav = encodeWav(new Int16Array(8000 * 23));
  it("says who called when, with the recording attached", () => {
    const text = decode(
      voicemailMessage(
        {
          remote: "+497223812345",
          to: "info@weber-haustechnik.test",
          at: new Date("2026-10-26T08:14:00.000Z"),
          seconds: 23,
          wav,
        },
        "grenze",
      ),
    );
    expect(text).toContain("Subject: Nachricht von 07223 812345 (0:23)");
    expect(text).toContain("To: <info@weber-haustechnik.test>");
    expect(text).toContain('Content-Type: multipart/mixed; boundary="grenze"');
    expect(text).toContain(
      'Content-Disposition: attachment; filename="Nachricht-497223812345.wav"',
    );
    const body = text.split("--grenze")[1]!.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toContain(
      "07223 812345 hat am Montag, 26. Oktober um 09:14 Uhr angerufen",
    );
    expect(text.endsWith("--grenze--\r\n")).toBe(true);
  });

  it("copes with a withheld number", () => {
    const text = decode(
      voicemailMessage({ remote: "", to: "a@b.test", at: new Date(), seconds: 5, wav }, "x"),
    );
    expect(text).toContain("Subject: Nachricht von unbekannter Nummer (0:05)");
    expect(text).toContain('filename="Nachricht-unbekannt.wav"');
  });

  it("encodes non-ASCII header words", () => {
    expect(encodeWord("Telefon")).toBe("Telefon");
    expect(encodeWord("Grüße")).toBe("=?UTF-8?B?R3LDvMOfZQ==?=");
  });
});
