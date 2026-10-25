import { describe, expect, it } from "vitest";
import { recipientsOf, withoutBcc } from "./raw";

const bytes = (text: string) => new Uint8Array(Buffer.from(text, "binary"));
const text = (data: Uint8Array) => Buffer.from(data).toString("binary");

describe("withoutBcc", () => {
  it("cuts the Bcc header with its folded lines and keeps the rest", () => {
    const mail =
      "From: a@gmail.com\r\nTo: b@x.de\r\nBcc: c@x.de,\r\n d@x.de\r\nSubject: Hallo\r\n\r\nBcc: im Text\r\n";
    expect(text(withoutBcc(bytes(mail)))).toBe(
      "From: a@gmail.com\r\nTo: b@x.de\r\nSubject: Hallo\r\n\r\nBcc: im Text\r\n",
    );
  });

  it("leaves a mail without Bcc and an 8-bit body untouched", () => {
    const mail = bytes("Subject: x\n\n\xe4\x80\xff");
    expect(withoutBcc(mail)).toEqual(mail);
  });
});

describe("recipientsOf", () => {
  it("lists To, Cc and Bcc, each address once", () => {
    expect(
      recipientsOf([{ email: "a@x.de" }], [{ email: "A@x.de" }, { email: "b@x.de" }], null, [
        { email: "c@x.de" },
      ]),
    ).toEqual(["a@x.de", "b@x.de", "c@x.de"]);
  });
});
