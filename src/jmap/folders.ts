/**
 * Managing own folders: rename, move, delete, and "Alle als gelesen markieren" (RFC 8621 §2.5
 * Mailbox/set, §4.4 Email/query, §4.6 Email/set). JMAP has no "set by query", so mails are
 * changed page by page; pages stay below Stalwart's `maxObjectsInGet` and `maxObjectsInSet`.
 */
import { emptyFolderPlan, type FolderMail } from "@/lib/empty-folder";
import { assertSetOk, type JmapClient } from "./client";

const PAGE = 250;

/**
 * Hands the mails matching `filter` to `change` a page at a time, until none match any more:
 * `change` must take every mail of its page out of the filter, so each query starts at the top.
 * Returns how many mails it changed.
 */
export const drainEmails = async (
  client: JmapClient,
  accountId: string,
  filter: Record<string, unknown>,
  change: (mails: FolderMail[]) => Record<string, unknown>,
): Promise<number> => {
  let changed = 0;
  for (;;) {
    const [, got] = await client.request([
      ["Email/query", { accountId, filter, limit: PAGE }, "q"],
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
    if (!mails.length) return changed;
    assertSetOk(await client.call("Email/set", { accountId, ...change(mails) }), "Email/set");
    changed += mails.length;
  }
};

/** Every unread mail of the folder gets `$seen`, not only the ones the list has loaded. */
export const markMailboxRead = (client: JmapClient, accountId: string, mailboxId: string) =>
  drainEmails(client, accountId, { inMailbox: mailboxId, notKeyword: "$seen" }, (mails) => ({
    update: Object.fromEntries(mails.map((mail) => [mail.id, { "keywords/$seen": true }])),
  }));

/** A new name or a new parent (null: the top level); the server refuses a loop (RFC 8621 §2). */
export const updateMailbox = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: { name?: string; parentId?: string | null },
): Promise<void> => {
  assertSetOk(
    await client.call("Mailbox/set", { accountId, update: { [id]: patch } }),
    "Mailbox/set",
  );
};

/**
 * Deletes folders, deepest first: RFC 8621 §2.5 refuses a folder with subfolders
 * (`mailboxHasChild`). Their mails go to the Papierkorb first, so they can be brought back;
 * `onDestroyRemoveEmails` would delete them for good (Stalwart, crates/email/src/mailbox/
 * destroy.rs). A mail that is also in another folder only leaves this one (empty-folder.ts).
 * Without a Papierkorb the server removes the mails with the folder.
 */
export const deleteMailboxes = async (
  client: JmapClient,
  accountId: string,
  deepestFirst: string[],
  trashId: string | undefined,
): Promise<void> => {
  for (const id of deepestFirst) {
    if (trashId) {
      await drainEmails(client, accountId, { inMailbox: id }, (mails) => {
        const { destroy: onlyHere, unlink } = emptyFolderPlan(mails, id);
        const leave = { [`mailboxIds/${id}`]: null };
        return {
          update: Object.fromEntries([
            ...onlyHere.map((mail) => [mail, { ...leave, [`mailboxIds/${trashId}`]: true }]),
            ...unlink.map((mail) => [mail, leave]),
          ]),
        };
      });
    }
    const result = await client.call("Mailbox/set", {
      accountId,
      destroy: [id],
      onDestroyRemoveEmails: !trashId,
    });
    assertSetOk(result, "Mailbox/set");
  }
};
