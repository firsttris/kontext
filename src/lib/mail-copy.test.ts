import { describe, expect, it } from "vitest";
import type { BodyPart, EmailDetail } from "@/jmap/types";
import { copyAttachments, copyFileName, mailCopyOf } from "./mail-copy";

const part = (patch: Partial<BodyPart>): BodyPart => ({
  partId: null,
  blobId: "b",
  type: "application/pdf",
  name: "Angebot.pdf",
  size: 1000,
  cid: null,
  disposition: "attachment",
  ...patch,
});

describe("mail as a copy", () => {
  it("holds who, when and the body", () => {
    const copy = mailCopyOf({
      subject: "Angebot Bad",
      from: [{ name: "Markus Hoffmann", email: "m@h.test" }],
      to: [{ name: null, email: "jonas@w.test" }],
      cc: null,
      receivedAt: "2026-10-24T08:00:00Z",
      htmlBody: [{ ...part({ partId: "1", type: "text/plain" }) }],
      textBody: [{ ...part({ partId: "1", type: "text/plain" }) }],
      bodyValues: { "1": { value: "Hallo Jonas" } },
    } as unknown as EmailDetail);
    expect(copy).toEqual({
      subject: "Angebot Bad",
      from: "Markus Hoffmann <m@h.test>",
      to: "jonas@w.test",
      cc: "",
      receivedAt: "2026-10-24T08:00:00Z",
      kind: "text",
      body: "Hallo Jonas",
    });
  });

  it("takes real attachments within the size, not pictures in the text", () => {
    const parts = [
      part({ name: "Angebot.pdf" }),
      part({ name: "logo.png", cid: "<logo>", disposition: "inline" }),
      part({ name: "Riesig.zip", size: 30 * 1024 * 1024 }),
      part({ name: "ohne.txt", blobId: null }),
    ];
    expect(copyAttachments({ attachments: parts }).map((p) => p.name)).toEqual(["Angebot.pdf"]);
  });

  it("names the file after the subject", () => {
    expect(copyFileName("AW: Angebot/Bad?")).toBe("AW Angebot Bad.mail.json");
    expect(copyFileName("")).toBe("Mail.mail.json");
  });
});
