import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { receiptsFor, receiptsToFile } from "./receipts";

const REPORT = 'multipart/report; report-type=disposition-notification; boundary="mdn"';

/** A mail the search finds: ordinary, or a receipt naming a Message-ID in its headers or report. */
type Mail = { id: string; from: string; inReplyTo?: string; original?: string; plain?: boolean };

const disposition = (original: string) =>
  [
    "Reporting-UA: Outlook",
    "Final-Recipient: rfc822;petra@keller-elektro.test",
    `Original-Message-ID: <${original}>`,
    "Disposition: manual-action/MDN-sent-manually; displayed",
    "",
  ].join("\r\n");

type Sent = { messageId: string; asked: boolean };

/** A Stalwart with these mails found by any search, and these in Sent; it keeps the filters. */
const fakeStalwart = (mails: Mail[], sent: Sent[] = []) => {
  const filters: Record<string, unknown>[] = [];
  const downloads: string[] = [];
  const client = {
    request: async (calls: [string, Record<string, unknown>, string][]) => {
      const [, query] = calls[0]!;
      filters.push(query.filter as Record<string, unknown>);
      const inSent = JSON.stringify(query.filter).includes('"inMailbox":"sent"');
      const list = inSent
        ? sent.map((mail) => ({
            messageId: [mail.messageId],
            "header:Disposition-Notification-To:asAddresses": mail.asked
              ? [{ name: null, email: "jonas@weber.test" }]
              : null,
          }))
        : mails.slice((query.position as number) ?? 0).map((mail) => ({
            id: mail.id,
            from: [{ name: null, email: mail.from }],
            receivedAt: "2026-10-29T10:00:00Z",
            inReplyTo: mail.inReplyTo ? [mail.inReplyTo] : null,
            references: null,
            "header:Content-Type": mail.plain ? "text/plain" : REPORT,
            bodyStructure: mail.plain
              ? { type: "text/plain", subParts: null }
              : {
                  type: "multipart/report",
                  subParts: [
                    { type: "text/plain", subParts: null },
                    {
                      type: "message/disposition-notification",
                      blobId: `mdn-${mail.id}`,
                      subParts: null,
                    },
                  ],
                },
          }));
      return [
        ["Email/query", { ids: [] }, "q"],
        ["Email/get", { list }, "g"],
      ];
    },
    download: async (_accountId: string, blobId: string) => {
      downloads.push(blobId);
      const mail = mails.find((candidate) => `mdn-${candidate.id}` === blobId)!;
      return new Blob([disposition(mail.original ?? "")]);
    },
  } as unknown as JmapClient;
  return { client, filters, downloads };
};

const sentMail = {
  messageId: "angebot.1@weber.test",
  subject: "Angebot Bad",
  sentAt: "2026-10-29T09:00:00Z",
  recipients: ["petra@keller-elektro.test"],
};

describe("receiptsFor", () => {
  it("finds a receipt by Original-Message-ID alone, whatever its subject", async () => {
    const { client, filters, downloads } = fakeStalwart([
      { id: "a", from: "petra@keller-elektro.test", original: "angebot.1@weber.test" },
      { id: "b", from: "petra@keller-elektro.test", original: "other@weber.test" },
      { id: "c", from: "petra@keller-elektro.test", plain: true },
    ]);
    const found = await receiptsFor(client, "acc", sentMail);
    expect(found.map((receipt) => receipt.id)).toEqual(["a"]);
    expect(downloads).toEqual(["mdn-a", "mdn-b"]);
    // Asked for by subject or by who sent it, after the mail.
    expect(JSON.stringify(filters[0])).toContain('"from":"petra@keller-elektro.test"');
    expect(JSON.stringify(filters[0])).toContain('"subject":"Angebot Bad"');
  });

  it("does not read the report when In-Reply-To names the mail already", async () => {
    const { client, downloads } = fakeStalwart([
      { id: "a", from: "petra@keller-elektro.test", inReplyTo: "angebot.1@weber.test" },
    ]);
    expect((await receiptsFor(client, "acc", sentMail)).map((r) => r.id)).toEqual(["a"]);
    expect(downloads).toEqual([]);
  });
});

describe("receiptsToFile", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const boxes = { inboxId: "inbox", sentId: "sent" };

  it("files only receipts for a sent mail that asked for one", async () => {
    const { client, filters } = fakeStalwart(
      [
        { id: "a", from: "petra@keller-elektro.test", original: "angebot.1@weber.test" },
        { id: "b", from: "petra@keller-elektro.test", original: "plain.2@weber.test" },
        { id: "c", from: "fake@example.test", original: "unknown@example.test" },
        { id: "d", from: "petra@keller-elektro.test", plain: true },
      ],
      [
        { messageId: "angebot.1@weber.test", asked: true },
        { messageId: "plain.2@weber.test", asked: false },
      ],
    );
    expect(await receiptsToFile(client, "acc", boxes, now)).toEqual(["a"]);
    // Unread receipts of the last 14 days, then the sent mails to their senders.
    expect(JSON.stringify(filters[0])).toContain('"notKeyword":"$seen"');
    expect(JSON.stringify(filters[0])).toContain('"after":"2026-10-15T11:59:00Z"');
    expect(JSON.stringify(filters.at(-1))).toContain('"to":"fake@example.test"');
  });

  it("asks nothing more without receipts", async () => {
    const { client, filters } = fakeStalwart([{ id: "d", from: "x@y.test", plain: true }]);
    expect(await receiptsToFile(client, "acc", boxes, now)).toEqual([]);
    expect(filters).toHaveLength(1);
  });
});

describe("receiptsToFile in a busy inbox", () => {
  it("files a new receipt behind more than a hundred unread mails", async () => {
    // A Stalwart that keeps to sort, position and limit: 120 unread mails, then the receipt.
    const at = (index: number) => new Date(Date.UTC(2026, 9, 20) + index * 3_600_000).toISOString();
    const ordinary = Array.from({ length: 120 }, (_, index) => ({
      id: `m${index}`,
      from: [{ name: null, email: "kunde@example.test" }],
      receivedAt: at(index),
      inReplyTo: null,
      references: null,
      "header:Content-Type": "text/plain",
      bodyStructure: { type: "text/plain", subParts: null },
    }));
    const receipt = {
      id: "r",
      from: [{ name: null, email: "petra@keller-elektro.test" }],
      receivedAt: at(120),
      inReplyTo: ["angebot.1@weber.test"],
      references: null,
      "header:Content-Type": REPORT,
      bodyStructure: { type: "multipart/report", subParts: [] },
    };
    const inbox = [...ordinary, receipt];
    const client = {
      request: async (calls: [string, Record<string, unknown>, string][]) => {
        const [, query] = calls[0]!;
        if (JSON.stringify(query.filter).includes('"inMailbox":"sent"')) {
          const list = [
            {
              messageId: ["angebot.1@weber.test"],
              "header:Disposition-Notification-To:asAddresses": [{ email: "jonas@weber.test" }],
            },
          ];
          return [
            ["Email/query", { ids: [] }, "q"],
            ["Email/get", { list }, "g"],
          ];
        }
        const [sort] = query.sort as { isAscending: boolean }[];
        const sorted = sort?.isAscending === false ? [...inbox].reverse() : inbox;
        const position = (query.position as number) ?? 0;
        const list = sorted.slice(position, position + (query.limit as number));
        return [
          ["Email/query", { ids: [] }, "q"],
          ["Email/get", { list }, "g"],
        ];
      },
      download: async () => new Blob([""]),
    } as unknown as JmapClient;
    const now = new Date("2026-10-29T12:00:00Z");
    expect(await receiptsToFile(client, "acc", { inboxId: "inbox", sentId: "sent" }, now)).toEqual([
      "r",
    ]);
  });
});
