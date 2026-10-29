/**
 * Empties a folder (Spam, Papierkorb) page by page: the mails of a page go (or leave the folder,
 * see empty-folder.ts), so the next query starts at the top again. Pages stay below Stalwart's
 * `maxObjectsInGet` and `maxObjectsInSet`.
 */
import { emptyFolderPlan, type FolderMail } from "@/lib/empty-folder";
import { assertSetOk, type JmapClient } from "./client";

const PAGE = 250;

/** How many mails it took out of the folder. */
export const emptyMailbox = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
): Promise<number> => {
  let removed = 0;
  for (;;) {
    const [, got] = await client.request([
      ["Email/query", { accountId, filter: { inMailbox: mailboxId }, limit: PAGE }, "q"],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
          properties: ["mailboxIds"],
        },
        "g",
      ],
    ]);
    const mails = (got![1] as { list: FolderMail[] }).list;
    if (!mails.length) return removed;
    const { destroy, unlink } = emptyFolderPlan(mails, mailboxId);
    const result = await client.call("Email/set", {
      accountId,
      destroy,
      update: Object.fromEntries(unlink.map((id) => [id, { [`mailboxIds/${mailboxId}`]: null }])),
    });
    assertSetOk(result, "Email/set");
    removed += mails.length;
  }
};
