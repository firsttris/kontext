/**
 * A folder as an .mbox file: the mails, oldest first, page by page (RFC 8621 §4.4 Email/query,
 * §4.2 Email/get), each message downloaded as it is stored (RFC 8620 §6.2) and written by
 * `mboxEntry`. Each mail becomes a Blob of its own as soon as it is written, so the page's bytes
 * do not pile up in JavaScript; the browser keeps the Blobs (Chrome moves large ones to disk).
 */
import { type MboxMail, mboxEntry } from "@/lib/mbox";
import type { JmapClient } from "./client";

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

export const exportMailbox = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
): Promise<Blob> => {
  const entries: Blob[] = [];
  for (let position = 0; ; position += PAGE) {
    const [, got] = await client.request([
      [
        "Email/query",
        {
          accountId,
          filter: { inMailbox: mailboxId },
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
          properties: ["blobId", "receivedAt", "keywords", "from"],
        },
        "g",
      ],
    ]);
    const mails = (got![1] as { list: ExportMail[] }).list;
    for (const mail of mails) {
      const raw = await client.download(accountId, mail.blobId, "mail.eml", "message/rfc822");
      const parts = mboxEntry(new Uint8Array(await raw.arrayBuffer()), mboxMailOf(mail));
      entries.push(new Blob(parts as BlobPart[]));
    }
    if (mails.length < PAGE) return new Blob(entries, { type: "application/mbox" });
  }
};
