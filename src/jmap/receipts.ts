/**
 * Read receipts (RFC 8098) over JMAP: the receipts for a sent mail, and the ones in the inbox
 * that confirm one of the account's sent mails, to be filed away quietly. A receipt names the
 * mail in In-Reply-To or References, or only in its report's Original-Message-ID, which Stalwart
 * does not index – so receipts are looked for by who sent them, and their report is read.
 */
import type { BodyStructure, EmailAddress } from "@/jmap/types";
import {
  dispositionPart,
  isReceipt,
  parseDisposition,
  receiptsForSent,
  receiptTargets,
  type SentMail,
} from "@/lib/mdn";
import type { JmapClient } from "./client";
import { searchPages } from "./search-pages";

export type Receipt = {
  id: string;
  from: EmailAddress[] | null;
  receivedAt: string;
  inReplyTo: string[] | null;
  references: string[] | null;
  "header:Content-Type": string | null;
  bodyStructure: BodyStructure | null;
};

/** A receipt with the Message-IDs it confirms. */
export type ReadReceipt = Receipt & { targets: string[] };

const RECEIPT_QUERY = {
  properties: [
    "from",
    "receivedAt",
    "inReplyTo",
    "references",
    "header:Content-Type",
    "bodyStructure",
  ],
  bodyProperties: ["partId", "blobId", "type", "subParts"],
};

/** Pages a search reads at most (500 mails from those people after the send). */
const MAX_PAGES = 10;
/** People asked for at most; a mail to more is a newsletter, not one to confirm. */
const MAX_PEOPLE = 20;

const keepReceipt = (mail: Receipt) => isReceipt(mail["header:Content-Type"]);

/**
 * What a receipt confirms. Its own headers first; the report is read only when they do not
 * already name the mail `wanted` (or nothing is wanted in particular).
 */
const readTargets = async (
  client: JmapClient,
  accountId: string,
  mail: Receipt,
  wanted?: string,
): Promise<ReadReceipt> => {
  const fromHeaders = receiptTargets(mail, null);
  const part = dispositionPart(mail.bodyStructure);
  if ((wanted && fromHeaders.includes(wanted)) || !part?.blobId) {
    return { ...mail, targets: fromHeaders };
  }
  const blob = await client.download(accountId, part.blobId, "mdn.txt", "text/plain");
  return {
    ...mail,
    targets: receiptTargets(mail, parseDisposition(await blob.text()).originalMessageId),
  };
};

/** "after" a minute early: the receipt may carry the same second as the mail. */
const afterOf = (time: number) => new Date(time - 60_000).toISOString().replace(/\.\d+Z$/, "Z");

/**
 * The receipts for a sent mail: mails after it from one of its recipients or with its subject
 * ("Gelesen: …" carries it, unless the program says something else), kept when they are receipts
 * that name this mail.
 */
export const receiptsFor = async (
  client: JmapClient,
  accountId: string,
  {
    messageId,
    subject,
    sentAt,
    recipients,
  }: {
    messageId: string;
    subject: string;
    sentAt: string;
    recipients: string[];
  },
): Promise<ReadReceipt[]> => {
  const who = [
    ...(subject ? [{ subject }] : []),
    ...recipients.slice(0, MAX_PEOPLE).map((email) => ({ from: email })),
  ];
  const after = { after: afterOf(Date.parse(sentAt)) };
  const filter = who.length
    ? { operator: "AND", conditions: [after, { operator: "OR", conditions: who }] }
    : after;
  const found = await searchPages(
    client,
    accountId,
    { filter, ...RECEIPT_QUERY },
    keepReceipt,
    who.length ? MAX_PAGES : 1,
  );
  const read = await Promise.all(
    found.map((mail) => readTargets(client, accountId, mail, messageId)),
  );
  return read.filter((mail) => mail.targets.includes(messageId));
};

/** How far back unread receipts in the inbox are filed. */
const RECENT_DAYS = 14;
/** Sent mails to the receipts' senders compared at most, newest first. */
const SENT_LIMIT = 200;

/** The sent mails to these people, newest first: their Message-ID and whether they asked. */
const sentTo = async (
  client: JmapClient,
  accountId: string,
  sentId: string,
  people: string[],
): Promise<SentMail[]> => {
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: {
          operator: "AND",
          conditions: [
            { inMailbox: sentId },
            {
              operator: "OR",
              conditions: people.flatMap((email) => [{ to: email }, { cc: email }, { bcc: email }]),
            },
          ],
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: SENT_LIMIT,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["messageId", "header:Disposition-Notification-To:asAddresses"],
      },
      "g",
    ],
  ]);
  const list = (got![1] as { list?: Record<string, unknown>[] }).list ?? [];
  return list.map((mail) => ({
    messageId: (mail.messageId as string[] | null) ?? null,
    receiptTo: (mail["header:Disposition-Notification-To:asAddresses"] as unknown[] | null) ?? null,
  }));
};

/**
 * The unread receipts of the last days in the inbox that confirm a mail sent from this account
 * with a request for one – nothing else: a mail that only looks like a receipt, or one for a mail
 * not found in Sent, stays where it is.
 */
export const receiptsToFile = async (
  client: JmapClient,
  accountId: string,
  { inboxId, sentId }: { inboxId: string; sentId: string },
  now: Date,
): Promise<string[]> => {
  const filter = {
    operator: "AND",
    conditions: [
      { inMailbox: inboxId },
      { notKeyword: "$seen" },
      { after: afterOf(now.getTime() - RECENT_DAYS * 86_400_000) },
    ],
  };
  const found = await searchPages(client, accountId, { filter, ...RECEIPT_QUERY }, keepReceipt, 2);
  if (!found.length) return [];
  const read = await Promise.all(found.map((mail) => readTargets(client, accountId, mail)));
  const people = [
    ...new Set(read.flatMap((mail) => mail.from ?? []).map((a) => a.email.toLowerCase())),
  ].slice(0, MAX_PEOPLE);
  if (!people.length) return [];
  const sent = await sentTo(client, accountId, sentId, people);
  return receiptsForSent(read, sent).map((mail) => mail.id);
};
