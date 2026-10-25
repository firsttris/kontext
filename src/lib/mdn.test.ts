// @vitest-environment node
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { isReceipt, receiptAnswered, receiptMessage } from "./mdn";

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
