/**
 * What can be done with mails: read, flag, categorise, move, archive, delete, mark as spam. The
 * cached lists change at once and are loaded again when the server answered.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import {
  copyEmails,
  createMailbox,
  destroyEmails,
  JUNK_KEYWORDS,
  listMailboxes,
  moveEmails,
  setKeyword,
} from "@/jmap/mail";
import type { EmailDetail, EmailSummary, Mailbox } from "@/jmap/types";
import { findRole } from "@/lib/mailboxes";
import { adjustUnreadCounts, mailboxesKey, patchCachedEmails } from "./queries";

export type MoveTarget = { accountId: string; mailboxId: string };

/**
 * Moves mails into a folder of any mailbox: within the account a folder change, into another
 * account a copy there and a delete here. The account is passed per call, so a list over several
 * accounts (drag and drop in "Alle Posteingänge") can use one hook.
 */
export const useMoveTo = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      emails,
      from,
      target,
    }: {
      accountId: string;
      emails: EmailSummary[];
      from: string;
      target: MoveTarget;
    }) =>
      target.accountId === accountId
        ? moveEmails(
            client,
            accountId,
            emails.map((email) => email.id),
            from,
            target.mailboxId,
          )
        : copyEmails(client, accountId, target.accountId, emails, target.mailboxId),
    onMutate: ({ accountId, emails }) =>
      patchCachedEmails(
        queryClient,
        accountId,
        emails.map((email) => email.id),
        () => null,
      ),
    onSettled: (_data, _error, { accountId, target }) =>
      Promise.all(
        [...new Set([accountId, target.accountId])].map((id) =>
          queryClient.invalidateQueries({ queryKey: [id] }),
        ),
      ),
  });
};

/**
 * Read, flag, categorise, move, archive and delete, with the lists updated before the server
 * answers. Every action names its account, so a selection over several mailboxes can use one hook.
 */
export const useMailActions = () => {
  const client = useClient();
  const queryClient = useQueryClient();

  const refresh = (accountId: string) => queryClient.invalidateQueries({ queryKey: [accountId] });
  const moveTo = useMoveTo();

  const keyword = useMutation({
    mutationFn: ({
      accountId,
      ids,
      keyword,
      on,
    }: {
      accountId: string;
      ids: string[];
      keyword: string;
      on: boolean;
    }) => setKeyword(client, accountId, ids, keyword, on),
    onMutate: ({ accountId, ids, keyword, on }) => {
      if (keyword === "$seen") adjustUnreadCounts(queryClient, accountId, ids, on);
      const switched = <T extends EmailSummary>(email: T): T => ({
        ...email,
        keywords: on
          ? { ...email.keywords, [keyword]: true }
          : Object.fromEntries(Object.entries(email.keywords).filter(([key]) => key !== keyword)),
      });
      patchCachedEmails(queryClient, accountId, ids, switched);
      // The open mail too, so its menu and chips follow at once.
      for (const id of ids) {
        queryClient.setQueryData<EmailDetail>([accountId, "email", id], (email) =>
          email ? switched(email) : email,
        );
      }
    },
    onSettled: (_data, _error, { accountId }) => refresh(accountId),
  });

  const move = useMutation({
    mutationFn: async ({
      accountId,
      ids,
      from,
      to,
      keywords,
    }: {
      accountId: string;
      ids: string[];
      from: string;
      to: string;
      keywords?: Record<string, true | null>;
    }) => moveEmails(client, accountId, ids, from, to, keywords),
    onMutate: ({ accountId, ids }) => patchCachedEmails(queryClient, accountId, ids, () => null),
    onSettled: (_data, _error, { accountId }) => refresh(accountId),
  });

  const destroy = useMutation({
    mutationFn: ({ accountId, ids }: { accountId: string; ids: string[] }) =>
      destroyEmails(client, accountId, ids),
    onMutate: ({ accountId, ids }) => patchCachedEmails(queryClient, accountId, ids, () => null),
    onSettled: (_data, _error, { accountId }) => refresh(accountId),
  });

  const mailboxesOf = (accountId: string) =>
    queryClient.getQueryData<Mailbox[]>(mailboxesKey(accountId)) ?? [];

  /** The archive folder; created on first use, since Stalwart does not set one up. */
  const archiveMailboxId = async (accountId: string): Promise<string> => {
    const mailboxes = await queryClient.fetchQuery({
      queryKey: mailboxesKey(accountId),
      queryFn: () => listMailboxes(client, accountId),
    });
    const existing = findRole(mailboxes, "archive");
    if (existing) return existing.id;
    const id = await createMailbox(client, accountId, "Archiv", null, "archive");
    await queryClient.invalidateQueries({ queryKey: mailboxesKey(accountId) });
    return id;
  };

  return {
    setSeen: (accountId: string, ids: string[], seen: boolean) =>
      keyword.mutateAsync({ accountId, ids, keyword: "$seen", on: seen }),
    setFlagged: (accountId: string, ids: string[], flagged: boolean) =>
      keyword.mutateAsync({ accountId, ids, keyword: "$flagged", on: flagged }),
    /** A category (its keyword) on or off. */
    setCategory: (accountId: string, ids: string[], category: string, on: boolean) =>
      keyword.mutateAsync({ accountId, ids, keyword: category, on }),
    /** Into a folder of this or of another mailbox (`target.accountId`). */
    moveTo: (accountId: string, emails: EmailSummary[], from: string, target: MoveTarget) =>
      moveTo.mutateAsync({ accountId, emails, from, target }),
    archive: async (accountId: string, ids: string[], from: string) =>
      move.mutateAsync({ accountId, ids, from, to: await archiveMailboxId(accountId) }),
    /** Into the archive and read, in one step (read receipts filed away). */
    archiveRead: async (accountId: string, ids: string[], from: string) =>
      move.mutateAsync({
        accountId,
        ids,
        from,
        to: await archiveMailboxId(accountId),
        keywords: { $seen: true },
      }),
    /** Into Spam, and out of it into the inbox; the spam filter learns from both. */
    markSpam: (accountId: string, ids: string[], from: string, spam: boolean) => {
      const to = findRole(mailboxesOf(accountId), spam ? "junk" : "inbox");
      if (!to) throw new Error(spam ? "Kein Spam-Ordner" : "Kein Posteingang");
      return move.mutateAsync({
        accountId,
        ids,
        from,
        to: to.id,
        keywords: spam ? JUNK_KEYWORDS.spam : JUNK_KEYWORDS.notSpam,
      });
    },
    /** Moves to the trash; in the trash it deletes for good. */
    remove: async (accountId: string, ids: string[], from: string) => {
      const trash = findRole(mailboxesOf(accountId), "trash");
      if (!trash || trash.id === from) return destroy.mutateAsync({ accountId, ids });
      return move.mutateAsync({ accountId, ids, from, to: trash.id });
    },
  };
};

export type MailActions = ReturnType<typeof useMailActions>;

/** The actions for one mailbox, as the reading pane uses them. */
export const useEmailActions = (accountId: string) => {
  const actions = useMailActions();
  return {
    setSeen: (ids: string[], seen: boolean) => actions.setSeen(accountId, ids, seen),
    setFlagged: (ids: string[], flagged: boolean) => actions.setFlagged(accountId, ids, flagged),
    setCategory: (ids: string[], category: string, on: boolean) =>
      actions.setCategory(accountId, ids, category, on),
    moveTo: (emails: EmailSummary[], from: string, target: MoveTarget) =>
      actions.moveTo(accountId, emails, from, target),
    archive: (ids: string[], from: string) => actions.archive(accountId, ids, from),
    markSpam: (ids: string[], from: string, spam: boolean) =>
      actions.markSpam(accountId, ids, from, spam),
    remove: (ids: string[], from: string) => actions.remove(accountId, ids, from),
  };
};
