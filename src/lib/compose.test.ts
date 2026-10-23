import { describe, expect, it } from "vitest";
import type { EmailDetail } from "@/jmap/types";
import { startCompose } from "./compose";

const original: EmailDetail = {
  id: "e1",
  threadId: "t1",
  mailboxIds: { a: true },
  keywords: {},
  from: [{ name: "Petra Keller", email: "petra@keller.test" }],
  to: [{ name: "Jonas", email: "jonas@weber.test" }],
  cc: [{ name: "Anna", email: "anna@weber.test" }],
  bcc: null,
  replyTo: null,
  subject: "Angebot <2027>",
  receivedAt: "2026-10-23T07:41:00Z",
  sentAt: "2026-10-23T07:40:00Z",
  preview: "",
  hasAttachment: true,
  size: 100,
  messageId: ["angebot@keller.test"],
  references: ["start@keller.test"],
  inReplyTo: null,
  htmlBody: [],
  textBody: [],
  attachments: [
    {
      partId: "2",
      blobId: "b1",
      type: "application/pdf",
      name: "Angebot.pdf",
      size: 5,
      cid: null,
      disposition: "attachment",
    },
  ],
  bodyValues: {},
};

describe("startCompose", () => {
  it("answers the sender with the original quoted", () => {
    const start = startCompose("reply", original, "<p>Hallo</p>", ["jonas@weber.test"]);
    expect(start.to.map((a) => a.email)).toEqual(["petra@keller.test"]);
    expect(start.cc).toEqual([]);
    expect(start.subject).toBe("Re: Angebot <2027>");
    expect(start.inReplyTo).toEqual(["angebot@keller.test"]);
    expect(start.references).toEqual(["start@keller.test"]);
    expect(start.html).toContain("<blockquote><p>Hallo</p></blockquote>");
    expect(start.html).toContain("schrieb Petra Keller:");
  });
  it("keeps the others in Cc for reply all", () => {
    const start = startCompose("replyAll", original, "", ["jonas@weber.test"]);
    expect(start.cc.map((a) => a.email)).toEqual(["anna@weber.test"]);
  });
  it("forwards with the attachments and escaped header", () => {
    const start = startCompose("forward", original, "<p>Hallo</p>", ["jonas@weber.test"]);
    expect(start.to).toEqual([]);
    expect(start.subject).toBe("Fwd: Angebot <2027>");
    expect(start.html).toContain("Angebot &lt;2027&gt;");
    expect(start.forwardAttachments).toEqual([
      { blobId: "b1", name: "Angebot.pdf", type: "application/pdf", size: 5 },
    ]);
  });
  it("starts empty for a new mail", () => {
    expect(startCompose("new", original, "", []).subject).toBe("");
  });
});
