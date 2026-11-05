/**
 * Empties a folder (Spam, Papierkorb) page by page: the mails of a page go (or leave the folder,
 * see empty-folder.ts), so the next query starts at the top again (folders.ts).
 */
import { emptyFolderPlan } from "@/lib/empty-folder";
import type { JmapClient } from "./client";
import { drainEmails } from "./folders";

/** How many mails it took out of the folder. */
export const emptyMailbox = (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
): Promise<number> =>
  drainEmails(client, accountId, { inMailbox: mailboxId }, (mails) => {
    const { destroy, unlink } = emptyFolderPlan(mails, mailboxId);
    return {
      destroy,
      update: Object.fromEntries(unlink.map((id) => [id, { [`mailboxIds/${mailboxId}`]: null }])),
    };
  });
