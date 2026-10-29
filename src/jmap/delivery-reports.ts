/**
 * Delivery reports (DSN) over JMAP: whether a sent mail asked for one (its EmailSubmission's
 * envelope), the reports that came back for it, and what one report says (src/lib/dsn.ts).
 * Stalwart leaves EmailSubmission.dsnBlobIds empty, so the reports are looked for among the mails.
 */
import {
  type DeliveryReport,
  deliveryStatusPart,
  isDeliveryReport,
  parseDeliveryStatus,
  reportsOn,
} from "@/lib/dsn";
import { requestedReportId } from "@/lib/envelope";
import { CAPABILITIES, type JmapClient } from "./client";
import type { BodyStructure } from "./types";

/** A report as it is shown: what it says, and when it came. */
export type ReceivedReport = DeliveryReport & { receivedAt: string };

/** The message/delivery-status part of a report, read. */
export const readDeliveryReport = async (
  client: JmapClient,
  accountId: string,
  structure: BodyStructure | null,
): Promise<DeliveryReport | null> => {
  const part = deliveryStatusPart(structure);
  if (!part?.blobId) return null;
  const blob = await client.download(accountId, part.blobId, "status.txt", "text/plain");
  return parseDeliveryStatus(await blob.text());
};

type Submission = {
  envelope: {
    mailFrom: { parameters?: Record<string, string | null> | null };
    rcptTo: { parameters?: Record<string, string | null> | null }[];
  } | null;
};

/** The envelope id a sent mail asked a report for, or null (from its submission). */
export const requestedReport = async (
  client: JmapClient,
  accountId: string,
  emailId: string,
): Promise<string | null> => {
  const [, got] = await client.request(
    [
      ["EmailSubmission/query", { accountId, filter: { emailIds: [emailId] } }, "q"],
      [
        "EmailSubmission/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "EmailSubmission/query", path: "/ids" },
          properties: ["envelope"],
        },
        "g",
      ],
    ],
    [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission],
  );
  const list = (got![1] as { list?: Submission[] }).list ?? [];
  for (const { envelope } of list) {
    const id = envelope ? requestedReportId(envelope) : null;
    if (id) return id;
  }
  return null;
};

type Candidate = {
  receivedAt: string;
  "header:Content-Type": string | null;
  bodyStructure: BodyStructure | null;
};

/** Mails per search page. */
const PAGE = 50;
/**
 * How many pages a search by subject reads at most (1000 mails that mention it); without a
 * subject only the first, since every mail after the send would match.
 */
const MAX_PAGES = 20;

/** One page of the mails found: when each came, its Content-Type and its parts. */
const candidatePage = async (
  client: JmapClient,
  accountId: string,
  filter: Record<string, unknown>,
  position: number,
): Promise<Candidate[]> => {
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: true }],
        position,
        limit: PAGE,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["receivedAt", "header:Content-Type", "bodyStructure"],
        bodyProperties: ["partId", "blobId", "type", "subParts"],
      },
      "g",
    ],
  ]);
  return (got![1] as { list?: Candidate[] }).list ?? [];
};

/** The reports among the mails the search finds, page by page, up to `pages` pages. */
const reportCandidates = async (
  client: JmapClient,
  accountId: string,
  filter: Record<string, unknown>,
  pages: number,
  position = 0,
): Promise<Candidate[]> => {
  const page = await candidatePage(client, accountId, filter, position);
  const reports = page.filter((mail) => isDeliveryReport(mail["header:Content-Type"]));
  return page.length < PAGE || pages <= 1
    ? reports
    : [
        ...reports,
        ...(await reportCandidates(client, accountId, filter, pages - 1, position + PAGE)),
      ];
};

/**
 * The reports on a sent mail: mails after it that carry its subject (Stalwart indexes the
 * returned headers, not the status part) and are reports with its envelope id. A report can come
 * days later (a failure after the retries), after many mails with the same words, so the search
 * reads on past its first page.
 */
export const reportsFor = async (
  client: JmapClient,
  accountId: string,
  { reportId, subject, sentAt }: { reportId: string; subject: string; sentAt: string },
): Promise<ReceivedReport[]> => {
  // A minute early: the report may carry the same second as the mail.
  const after = new Date(Date.parse(sentAt) - 60_000).toISOString().replace(/\.\d+Z$/, "Z");
  const filter = subject
    ? { operator: "AND", conditions: [{ after }, { text: subject }] }
    : { after };
  const candidates = await reportCandidates(client, accountId, filter, subject ? MAX_PAGES : 1);
  const read = await Promise.all(
    candidates.map(async (mail) => {
      const report = await readDeliveryReport(client, accountId, mail.bodyStructure);
      return report && reportsOn(report, reportId)
        ? [{ ...report, receivedAt: mail.receivedAt }]
        : [];
    }),
  );
  return read.flat();
};
