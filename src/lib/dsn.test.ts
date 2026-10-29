import { describe, expect, it } from "vitest";
import type { BodyStructure } from "@/jmap/types";
import {
  deliveryStatusPart,
  isDeliveryReport,
  isStatusPart,
  parseDeliveryStatus,
  reportsOn,
} from "./dsn";

/** As Stalwart 0.16 writes it (crates/smtp/src/queue/dsn.rs). */
const stalwart = [
  "Reporting-MTA: dns;localhost",
  "Arrival-Date: Thu, 29 Oct 2026 17:24:49 +0000",
  "Original-Envelope-Id: probe-env-1",
  "",
  "Final-Recipient: rfc822;anna@weber-haustechnik.test",
  "Action: delivered",
  "Status: 2.1.5",
  "Remote-MTA: dns;localhost",
  "",
  "",
].join("\r\n");

/** A failure as RFC 3464 §6.2 shows it, folded and with two recipients. */
const failed = `Reporting-MTA: dns; cs.utk.edu
Original-Envelope-Id: a+2Bb

Original-Recipient: rfc822;louisl@larry.slip.umd.edu
Final-Recipient: rfc822;louisl@larry.slip.umd.edu
Action: failed
Status: 5.1.1 (user unknown)
Diagnostic-Code: smtp; 550 5.1.1 User unknown
Last-Attempt-Date: Thu, 7 Jul 1994 17:15:49 -0400

Final-Recipient: rfc822;
  pat@x.test
Action: delayed
Status: 4.0.0

Action: delivered
Status: 2.0.0
`;

describe("isDeliveryReport", () => {
  it("is a multipart/report of the delivery-status kind", () => {
    expect(
      isDeliveryReport(' multipart/report; report-type="delivery-status";\r\n boundary="x"'),
    ).toBe(true);
    expect(isDeliveryReport("multipart/report; report-type=delivery-status")).toBe(true);
    expect(isDeliveryReport("multipart/report; report-type=disposition-notification")).toBe(false);
    expect(isDeliveryReport("text/plain")).toBe(false);
    expect(isDeliveryReport(null)).toBe(false);
  });
});

describe("deliveryStatusPart", () => {
  const part = (type: string, subParts: BodyStructure[] | null = null): BodyStructure => ({
    partId: subParts ? null : type,
    blobId: subParts ? null : `b-${type}`,
    type,
    name: null,
    size: 1,
    cid: null,
    disposition: null,
    subParts,
  });

  it("finds the machine-readable part in the report", () => {
    const tree = part("multipart/report", [
      part("text/plain"),
      part("message/delivery-status"),
      part("message/rfc822"),
    ]);
    expect(deliveryStatusPart(tree)?.blobId).toBe("b-message/delivery-status");
  });

  it("tells the status part from the rest, without case", () => {
    expect(isStatusPart({ type: "Message/Delivery-Status" })).toBe(true);
    expect(isStatusPart({ type: "message/rfc822" })).toBe(false);
  });

  it("knows the international form (RFC 6533) and gives null without one", () => {
    expect(deliveryStatusPart(part("message/global-delivery-status"))?.type).toBe(
      "message/global-delivery-status",
    );
    expect(deliveryStatusPart(part("multipart/mixed", [part("text/plain")]))).toBeNull();
    expect(deliveryStatusPart(null)).toBeNull();
  });
});

describe("parseDeliveryStatus", () => {
  it("reads Stalwart's report: who, delivered, the envelope id", () => {
    expect(parseDeliveryStatus(stalwart)).toEqual({
      envelopeId: "probe-env-1",
      reportingMta: "localhost",
      recipients: [
        {
          recipient: "anna@weber-haustechnik.test",
          outcome: "delivered",
          status: "2.1.5",
          diagnostic: null,
          lastAttempt: null,
        },
      ],
    });
  });

  it("reads a failure with its reason and time, folded lines and xtext", () => {
    const report = parseDeliveryStatus(failed);
    expect(report.envelopeId).toBe("a+b");
    expect(report.reportingMta).toBe("cs.utk.edu");
    expect(report.recipients).toEqual([
      {
        recipient: "louisl@larry.slip.umd.edu",
        outcome: "failed",
        status: "5.1.1",
        diagnostic: "550 5.1.1 User unknown",
        lastAttempt: "1994-07-07T21:15:49.000Z",
      },
      {
        recipient: "pat@x.test",
        outcome: "delayed",
        status: "4.0.0",
        diagnostic: null,
        lastAttempt: null,
      },
    ]);
  });

  it("counts expanded as delivered and leaves unknown actions out", () => {
    const report = parseDeliveryStatus(
      "Reporting-MTA: dns;m\n\nFinal-Recipient: rfc822;l@x.test\nAction: expanded\n\nFinal-Recipient: rfc822;o@x.test\nAction: whatever\n",
    );
    expect(report.envelopeId).toBeNull();
    expect(report.recipients.map((r) => [r.recipient, r.outcome])).toEqual([
      ["l@x.test", "delivered"],
    ]);
  });
});

describe("reportsOn", () => {
  it("matches the envelope id the mail was sent with", () => {
    const report = parseDeliveryStatus(stalwart);
    expect(reportsOn(report, "probe-env-1")).toBe(true);
    expect(reportsOn(report, "other")).toBe(false);
    expect(reportsOn(parseDeliveryStatus(failed), "a+2Bb")).toBe(true);
    expect(reportsOn({ envelopeId: null, reportingMta: null, recipients: [] }, "x")).toBe(false);
  });
});
