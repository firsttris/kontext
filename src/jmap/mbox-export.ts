/**
 * A folder as an .mbox file: the mails, oldest first (RFC 8621 §4.4 Email/query, §4.2
 * Email/get), each message downloaded as it is stored (RFC 8620 §6.2) and written by `mboxEntry`.
 * Each mail becomes a Blob of its own as soon as it is written, so the page's bytes do not pile
 * up in JavaScript; the browser keeps the Blobs (Chrome moves large ones to disk).
 */
import { chunk } from "@/lib/chunk";
import { type MboxMail, mboxEntry } from "@/lib/mbox";
import type { JmapClient } from "./client";

/** Ids per query, below Stalwart's maxQueryResults (5000, registry schema `Jmap`). */
const QUERY_PAGE = 1000;
/** Mails per Email/get. */
const PAGE = 100;

type ExportMail = {
  id: string;
  blobId: string;
  receivedAt: string;
  keywords: Record<string, boolean>;
  from: { email: string }[] | null;
};

const mboxMailOf = (mail: ExportMail): MboxMail => ({
  sender: mail.from?.[0]?.email ?? "",
  receivedAt: new Date(mail.receivedAt),
  keywords: mail.keywords,
});

/**
 * The folder's ids, oldest first, all before the first download: paging by position while the
 * downloads run would skip a mail whenever one before it leaves the folder in the meantime.
 */
const folderIds = async (client: JmapClient, accountId: string, mailboxId: string) => {
  const ids: string[] = [];
  for (let position = 0; ; position += QUERY_PAGE) {
    const answer = await client.call<{ ids: string[] }>("Email/query", {
      accountId,
      filter: { inMailbox: mailboxId },
      sort: [{ property: "receivedAt", isAscending: true }],
      position,
      limit: QUERY_PAGE,
    });
    ids.push(...answer.ids);
    if (answer.ids.length < QUERY_PAGE) return ids;
  }
};

export const exportMailbox = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
): Promise<Blob> => {
  const entries: Blob[] = [];
  for (const ids of chunk(await folderIds(client, accountId, mailboxId), PAGE)) {
    // A mail deleted since the query is in notFound and stays out.
    const { list } = await client.call<{ list: ExportMail[] }>("Email/get", {
      accountId,
      ids,
      properties: ["blobId", "receivedAt", "keywords", "from"],
    });
    for (const mail of list) {
      const raw = await client.download(accountId, mail.blobId, "mail.eml", "message/rfc822");
      const parts = mboxEntry(new Uint8Array(await raw.arrayBuffer()), mboxMailOf(mail));
      entries.push(new Blob(parts as BlobPart[]));
    }
  }
  return new Blob(entries, { type: "application/mbox" });
};
