import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { reportsFor } from "./delivery-reports";

const REPORT_TYPE = 'multipart/report; report-type=delivery-status; boundary="dsn"';

/** A mail found by the search: an ordinary one, or a report on the mail sent with this ENVID. */
type Mail = { id: string; receivedAt: string; reportOn?: string };

const statusText = (envelopeId: string) =>
  [
    "Reporting-MTA: dns; mx.keller-elektro.test",
    `Original-Envelope-Id: ${envelopeId}`,
    "",
    "Final-Recipient: rfc822; petra@keller-elektro.test",
    "Action: delivered",
    "Status: 2.0.0",
    "",
  ].join("\r\n");

/**
 * A Stalwart whose search matches these mails (in this order), honouring position and limit as
 * Email/query does (RFC 8620 §5.5).
 */
const fakeStalwart = (mails: Mail[]) =>
  ({
    request: async (calls: [string, Record<string, unknown>, string][]) => {
      const [, query] = calls[0]!;
      const position = (query.position as number | undefined) ?? 0;
      const limit = (query.limit as number | undefined) ?? mails.length;
      const found = mails.slice(position, position + limit);
      return [
        ["Email/query", { ids: found.map((mail) => mail.id), position, total: mails.length }, "q"],
        [
          "Email/get",
          {
            list: found.map((mail) => ({
              id: mail.id,
              receivedAt: mail.receivedAt,
              "header:Content-Type": mail.reportOn ? REPORT_TYPE : "text/plain",
              bodyStructure: mail.reportOn
                ? {
                    type: "multipart/report",
                    subParts: [{ type: "message/delivery-status", blobId: `status-${mail.id}` }],
                  }
                : { type: "text/plain", blobId: `body-${mail.id}` },
            })),
          },
          "g",
        ],
      ];
    },
    download: async (_accountId: string, blobId: string) => {
      const mail = mails.find((candidate) => `status-${candidate.id}` === blobId)!;
      return new Blob([statusText(mail.reportOn!)]);
    },
  }) as unknown as JmapClient;

const at = (minute: number) => new Date(Date.UTC(2026, 9, 29, 9, minute)).toISOString();

describe("reportsFor", () => {
  it("finds the report even when more than 50 mails with the subject came before it", async () => {
    // A failure report can take days (the queue retries); a busy mailbox gets many mails
    // that mention the same word in that time.
    const mails: Mail[] = [
      ...Array.from({ length: 60 }, (_, index) => ({ id: `m${index}`, receivedAt: at(index) })),
      { id: "report", receivedAt: at(61), reportOn: "5f0c-41" },
    ];
    const reports = await reportsFor(fakeStalwart(mails), "a", {
      reportId: "5f0c-41",
      subject: "Angebot",
      sentAt: at(0),
    });
    expect(reports.map((report) => report.recipients[0]?.recipient)).toEqual([
      "petra@keller-elektro.test",
    ]);
  });
});
