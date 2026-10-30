/**
 * Who mails are with: the latest of an account, for "Weitere Kontakte" (src/lib/other-contacts.ts),
 * and the ones tasks link to, for a contact's tasks (src/lib/task-context.ts).
 */

import { chunk } from "@/lib/chunk";
import type { Correspondence } from "@/lib/other-contacts";
import type { JmapClient } from "./client";
import type { EmailAddress } from "./types";

/** Raw headers, as Stalwart names them (RFC 8621 §4.1.3); null when the mail has none. */
const LIST_ID = "header:List-Id:asText";
const LIST_UNSUBSCRIBE = "header:List-Unsubscribe:asText";
/** The headers Email/get asks for; only whether a mail has them counts. */
export const CORRESPONDENCE_HEADERS = [LIST_ID, LIST_UNSUBSCRIBE];

type Row = {
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  receivedAt: string;
  [LIST_ID]?: string | null;
  [LIST_UNSUBSCRIBE]?: string | null;
};

/**
 * The newest `limit` mails outside `skipMailboxIds` (junk and trash), one round-trip. 500 is
 * Stalwart's `maxObjectsInGet`.
 */
export const recentCorrespondence = async (
  client: JmapClient,
  accountId: string,
  skipMailboxIds: string[],
  limit = 500,
): Promise<Correspondence[]> => {
  const filter = skipMailboxIds.length
    ? { operator: "NOT", conditions: skipMailboxIds.map((inMailbox) => ({ inMailbox })) }
    : {};
  const [, get] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["from", "to", "cc", "receivedAt", ...CORRESPONDENCE_HEADERS],
      },
      "g",
    ],
  ]);
  return ((get![1].list as Row[]) ?? []).map((row) => ({
    from: row.from,
    to: row.to,
    cc: row.cc,
    receivedAt: row.receivedAt,
    bulk: Boolean(row[LIST_ID] || row[LIST_UNSUBSCRIBE]),
  }));
};

/** Mails per Email/get: Stalwart's `maxObjectsInGet` is 500; well below it. */
const GET_SIZE = 250;

export type Participants = {
  accountId: string;
  id: string;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
};

/**
 * Who these mails were with (From, To, Cc), in one request for all accounts (only accounts in the
 * session: an unknown one fails the request); a mail since deleted is simply missing.
 */
export const participants = async (
  client: JmapClient,
  idsByAccount: Record<string, string[]>,
): Promise<Participants[]> => {
  const calls = Object.entries(idsByAccount).flatMap(([accountId, ids]) =>
    chunk(ids, GET_SIZE).map(
      (part, index) =>
        [
          "Email/get",
          { accountId, ids: part, properties: ["from", "to", "cc"] },
          `${accountId}-${index}`,
        ] as [string, Record<string, unknown>, string],
    ),
  );
  if (!calls.length) return [];
  const answers = await client.request(calls);
  return answers.flatMap(([name, result]) =>
    name === "Email/get"
      ? (
          (result as { accountId: string; list?: Omit<Participants, "accountId">[] }).list ?? []
        ).map((mail) => ({ ...mail, accountId: (result as { accountId: string }).accountId }))
      : [],
  );
};
