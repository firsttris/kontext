// @vitest-environment node
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import type { BodyStructure } from "@/jmap/types";
import {
  bareMessageId,
  dispositionPart,
  isReceipt,
  parseDisposition,
  receiptAnswered,
  receiptMessage,
  receiptsForSent,
  receiptTargets,
} from "./mdn";

describe("read receipts", () => {
  const raw = receiptMessage({
    from: { name: "Max Becker", email: "max@w.test" },
    to: { name: "Jonas Weber", email: "jonas@w.test" },
    original: { messageId: "abc@w.test", subject: "Angebot Bad", sentAt: "2026-10-25T08:00:00Z" },
    now: new Date("2026-10-25T09:30:00Z"),
    id: "r1",
  });

  it("is a report the other side's mail program understands", () => {
    expect(raw).toContain("To: Jonas Weber <jonas@w.test>\r\n");
    expect(raw).toContain("Subject: Gelesen: Angebot Bad\r\n");
    expect(raw).toContain("In-Reply-To: <abc@w.test>\r\n");
    expect(raw).toContain(
      'Content-Type: multipart/report; report-type=disposition-notification; boundary="kontext-mdn-r1"',
    );
    expect(raw).toContain("Original-Message-ID: <abc@w.test>\r\n");
    expect(raw).toContain("Disposition: manual-action/MDN-sent-manually; displayed\r\n");
    expect(raw.endsWith("--kontext-mdn-r1--\r\n")).toBe(true);
  });

  it("writes umlauts in headers as encoded words", () => {
    const umlaut = receiptMessage({
      from: { name: null, email: "max@w.test" },
      to: { name: null, email: "jonas@w.test" },
      original: { messageId: "x@w.test", subject: "Übergabe", sentAt: "2026-10-25T08:00:00Z" },
      now: new Date(),
      id: "r2",
    });
    expect(umlaut).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
    expect(umlaut).toContain("From: <max@w.test>\r\n");
  });

  it("quotes a display name with a comma, so From and To stay one mailbox each (RFC 5322 3.4)", async () => {
    const parsed = await PostalMime.parse(
      receiptMessage({
        from: { name: "Becker, Max", email: "max@w.test" },
        to: { name: "Weber, Jonas", email: "jonas@w.test" },
        original: { messageId: "abc@w.test", subject: "Angebot", sentAt: "2026-10-25T08:00:00Z" },
        now: new Date("2026-10-25T09:30:00Z"),
        id: "r3",
      }),
    );
    expect(parsed.from).toEqual({ name: "Becker, Max", address: "max@w.test" });
    expect(parsed.to).toEqual([{ name: "Weber, Jonas", address: "jonas@w.test" }]);
  });

  it("keeps a backslash in a quoted display name (RFC 5322 3.2.4)", async () => {
    const receipt = (name: string) =>
      receiptMessage({
        from: { name, email: "max@w.test" },
        to: { name: null, email: "jonas@w.test" },
        original: { messageId: "abc@w.test", subject: "Angebot", sentAt: "2026-10-25T08:00:00Z" },
        now: new Date("2026-10-25T09:30:00Z"),
        id: "r4",
      });
    for (const name of ["IT\\Admin (Weber)", "Becker, Max\\"]) {
      expect((await PostalMime.parse(receipt(name))).from).toEqual({ name, address: "max@w.test" });
    }
  });

  it("knows a receipt by its type", () => {
    expect(isReceipt(' multipart/report; report-type="disposition-notification"; boundary=x')).toBe(
      true,
    );
    expect(isReceipt("multipart/report; report-type=delivery-status")).toBe(false);
    expect(isReceipt(null)).toBe(false);
  });

  it("knows an answered receipt whatever the case", () => {
    expect(receiptAnswered({ $mdnsent: true })).toBe(true);
    expect(receiptAnswered({ $MDNSent: true })).toBe(true);
    expect(receiptAnswered({ $seen: true })).toBe(false);
  });
});

describe("reading a receipt", () => {
  it("finds the disposition part in the report", () => {
    const report = {
      type: "multipart/report",
      subParts: [
        { type: "text/plain", subParts: null },
        { type: "message/disposition-notification", blobId: "d", subParts: null },
      ],
    } as unknown as BodyStructure;
    expect(dispositionPart(report)?.blobId).toBe("d");
    expect(dispositionPart({ type: "text/plain", subParts: null } as BodyStructure)).toBeNull();
  });

  it("reads Original-Message-ID and Final-Recipient, folded lines too", () => {
    const text = [
      "Reporting-UA: mail.example; Outlook",
      "Final-Recipient: rfc822;",
      " petra@keller-elektro.test",
      "Original-Message-ID: <abc.123@weber-haustechnik.test>",
      "Disposition: manual-action/MDN-sent-manually; displayed",
      "",
    ].join("\r\n");
    expect(parseDisposition(text)).toEqual({
      originalMessageId: "abc.123@weber-haustechnik.test",
      finalRecipient: "petra@keller-elektro.test",
    });
    expect(parseDisposition("Disposition: displayed\r\n").originalMessageId).toBeNull();
  });

  it("takes Message-IDs with or without brackets", () => {
    expect(bareMessageId(" <a@b> ")).toBe("a@b");
    expect(bareMessageId("a@b")).toBe("a@b");
    expect(bareMessageId("two words")).toBeNull();
  });

  it("names the mail by its headers and by the report", () => {
    expect(receiptTargets({ inReplyTo: ["x@y"], references: ["w@y", "x@y"] }, "z@y")).toEqual([
      "x@y",
      "w@y",
      "z@y",
    ]);
    expect(receiptTargets({ inReplyTo: null, references: null }, null)).toEqual([]);
  });
});

describe("receipts filed away", () => {
  const sent = [
    { messageId: ["asked@w"], receiptTo: [{ email: "jonas@w" }] },
    { messageId: ["plain@w"], receiptTo: null },
  ];

  it("keeps only receipts for a sent mail that asked for one", () => {
    const receipts = [
      { id: "1", targets: ["asked@w"] },
      { id: "2", targets: ["plain@w"] },
      { id: "3", targets: ["elsewhere@x"] },
      { id: "4", targets: [] },
    ];
    expect(receiptsForSent(receipts, sent).map((receipt) => receipt.id)).toEqual(["1"]);
  });
});
