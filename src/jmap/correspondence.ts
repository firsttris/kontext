/** Who the latest mails of an account are with, for "Weitere Kontakte" (src/lib/other-contacts.ts). */
import type { Correspondence } from "@/lib/other-contacts";
import type { JmapClient } from "./client";
import type { EmailAddress } from "./types";

/** Raw headers, as Stalwart names them (RFC 8621 §4.1.3); null when the mail has none. */
const LIST_ID = "header:List-Id:asText";
const LIST_UNSUBSCRIBE = "header:List-Unsubscribe:asText";

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
        properties: ["from", "to", "cc", "receivedAt", LIST_ID, LIST_UNSUBSCRIBE],
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
