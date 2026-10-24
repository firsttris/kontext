/**
 * Wiedervorlage: the times kept on Kontext's server (/api/snoozes), the mails in the account's
 * snoozed folder. Putting away and taking back move the mails; the server brings them back when
 * they are due (server/snooze/waker.ts).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { createMailbox, listMailboxes, moveEmails } from "@/jmap/mail";
import { findRole } from "@/lib/mailboxes";
import { RESURFACED, SNOOZED_NAME, type Snooze } from "../../../server/snooze/snooze";
import { mailboxesKey, patchCachedEmails } from "../mail/queries";

export { RESURFACED, type Snooze };

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/snoozes${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/**
 * Under the account, so a change pushed for it (the mail moving) loads the times again, also
 * for the colleagues in a shared mailbox.
 */
const snoozesKey = (accountId: string) => [accountId, "snoozes"] as const;

/** When each mail of the account comes back, by mail id. */
export const useSnoozes = (accountId: string): Map<string, string> => {
  const { data } = useQuery({
    queryKey: snoozesKey(accountId),
    queryFn: async () =>
      (await send<{ snoozes: Snooze[] }>("GET", `?accountId=${encodeURIComponent(accountId)}`))
        .snoozes,
    enabled: Boolean(accountId),
  });
  return new Map((data ?? []).map((snooze) => [snooze.emailId, snooze.until]));
};

export const useSnoozeActions = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const settle = (accountId: string) => queryClient.invalidateQueries({ queryKey: [accountId] });

  const folders = (accountId: string) =>
    queryClient.fetchQuery({
      queryKey: mailboxesKey(accountId),
      queryFn: () => listMailboxes(client, accountId),
    });

  /** The snoozed folder; created on first use, like the archive. */
  const snoozedId = async (accountId: string): Promise<string> => {
    const existing = findRole(await folders(accountId), "snoozed");
    if (existing) return existing.id;
    const id = await createMailbox(client, accountId, SNOOZED_NAME, null, "snoozed");
    await queryClient.invalidateQueries({ queryKey: mailboxesKey(accountId) });
    return id;
  };

  /** Brings mails back into the inbox now (and forgets their time). */
  const bringBack = async (accountId: string, ids: string[]) => {
    const [snoozed, inbox] = await folders(accountId).then((list) => [
      findRole(list, "snoozed"),
      findRole(list, "inbox"),
    ]);
    if (!snoozed || !inbox) throw new Error("Kein Posteingang");
    try {
      await moveEmails(client, accountId, ids, snoozed.id, inbox.id);
      await send("POST", "/remove", { accountId, emailIds: ids });
    } finally {
      await settle(accountId);
    }
  };

  return {
    /**
     * Puts mails away until `until`: first the time on the server, then the move – a time
     * without the mail in the folder is simply dropped when due. Returns the way back.
     */
    snooze: async (accountId: string, ids: string[], from: string, until: Date) => {
      const to = await snoozedId(accountId);
      await send("PUT", "", { accountId, emailIds: ids, until: until.toISOString() });
      // Already on Wiedervorlage: only the time changes.
      if (from === to) {
        await settle(accountId);
        return async () => undefined;
      }
      patchCachedEmails(queryClient, accountId, ids, () => null);
      try {
        // Back again before: put away anew, it is no longer "wieder vorgelegt".
        await moveEmails(client, accountId, ids, from, to, { [RESURFACED]: null });
      } finally {
        await settle(accountId);
      }
      return async () => {
        try {
          await moveEmails(client, accountId, ids, to, from);
          await send("POST", "/remove", { accountId, emailIds: ids });
        } finally {
          await settle(accountId);
        }
      };
    },
    bringBack,
  };
};
