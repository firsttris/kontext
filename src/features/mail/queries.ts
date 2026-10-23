/**
 * Data hooks of the mail app. Query keys start with the JMAP account id, so a push for that
 * account refreshes exactly its data.
 */
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES, isJmapError } from "@/jmap/client";
import {
  createMailbox,
  destroyEmails,
  type EmailFilter,
  type EmailPage,
  getEmail,
  getQuota,
  listIdentities,
  listMailboxes,
  moveEmails,
  queryEmails,
  setKeyword,
} from "@/jmap/mail";
import type { Account, EmailSummary, Mailbox } from "@/jmap/types";
import { findRole } from "@/lib/mailboxes";
import { usePrincipals } from "../sharing/queries";

/**
 * Mail accounts the user can open: the own one first, then shared mailboxes like info@. A
 * colleague who shares an address book or calendar also shows up as an account in the session,
 * so only accounts of groups count as shared mailboxes.
 */
export const useMailAccounts = (): Account[] => {
  const { data: session } = useSession();
  const { data: principals = [] } = usePrincipals();
  if (!session) return [];
  const groups = new Set(principals.filter((p) => p.type === "group").map((p) => p.id));
  return Object.entries(session.accounts)
    .filter(
      ([id, account]) =>
        CAPABILITIES.mail in account.accountCapabilities && (account.isPersonal || groups.has(id)),
    )
    .map(([id, account]) => ({ id, ...account }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));
};

export const mailboxesKey = (accountId: string) => [accountId, "mailboxes"] as const;

/** The folders of every mail account, by account id (same cache as each folder list). */
export const useAllMailboxes = (): Record<string, Mailbox[] | undefined> => {
  const client = useClient();
  const accounts = useMailAccounts();
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: mailboxesKey(account.id),
      queryFn: () => listMailboxes(client, account.id),
    })),
  });
  return Object.fromEntries(accounts.map((account, index) => [account.id, results[index]?.data]));
};

/** The inbox of every mail account (own first), for "Alle Posteingänge". */
export const useInboxes = (): { account: Account; mailbox: Mailbox }[] => {
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  return accounts.flatMap((account) => {
    const inbox = findRole(mailboxes[account.id] ?? [], "inbox");
    return inbox ? [{ account, mailbox: inbox }] : [];
  });
};

export const useMailboxes = (accountId: string) => {
  const client = useClient();
  return useQuery({
    queryKey: mailboxesKey(accountId),
    queryFn: () => listMailboxes(client, accountId),
  });
};

export const useEmailList = (accountId: string, filter: EmailFilter) => {
  const client = useClient();
  return useInfiniteQuery({
    queryKey: [accountId, "emails", filter],
    queryFn: ({ pageParam }) => queryEmails(client, accountId, filter, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: EmailPage) => {
      const next = last.position + last.emails.length;
      return next < last.total && last.emails.length > 0 ? next : undefined;
    },
  });
};

export const useEmail = (accountId: string, id: string | undefined) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "email", id],
    queryFn: () => getEmail(client, accountId, id!),
    enabled: Boolean(id),
  });
};

/**
 * The addresses one may send from in an account. Only owners (the user, members of a shared
 * mailbox) may read them; someone a mailbox was merely shared with gets "forbidden" at once.
 */
export const useIdentities = (accountId: string) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "identities"],
    queryFn: () => listIdentities(client, accountId),
    retry: (count, error) => !(isJmapError(error) && error.type === "forbidden") && count < 3,
  });
};

export const useQuota = (accountId: string) => {
  const client = useClient();
  return useQuery({ queryKey: [accountId, "quota"], queryFn: () => getQuota(client, accountId) });
};

type ListData = InfiniteData<EmailPage, number>;

/** Applies a change to the emails in every cached list of the account, for instant feedback. */
const patchCachedEmails = (
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  ids: string[],
  patch: (email: EmailSummary) => EmailSummary | null,
) => {
  const wanted = new Set(ids);
  queryClient.setQueriesData<ListData>({ queryKey: [accountId, "emails"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.flatMap((email) => {
              if (!wanted.has(email.id)) return [email];
              const next = patch(email);
              return next ? [next] : [];
            }),
          })),
        }
      : data,
  );
};

/** Keeps the unread counters of the folders right while a read/unread change is on its way. */
const adjustUnreadCounts = (
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  ids: string[],
  seen: boolean,
) => {
  const wanted = new Set(ids);
  const changed = new Map<string, EmailSummary>();
  for (const [, data] of queryClient.getQueriesData<ListData>({
    queryKey: [accountId, "emails"],
  })) {
    for (const email of data?.pages.flatMap((page) => page.emails) ?? []) {
      if (wanted.has(email.id) && Boolean(email.keywords.$seen) !== seen)
        changed.set(email.id, email);
    }
  }
  if (changed.size === 0) return;
  queryClient.setQueryData<Mailbox[]>(mailboxesKey(accountId), (mailboxes) =>
    mailboxes?.map((mailbox) => {
      const count = [...changed.values()].filter((email) => email.mailboxIds[mailbox.id]).length;
      return count
        ? { ...mailbox, unreadEmails: Math.max(0, mailbox.unreadEmails + (seen ? -count : count)) }
        : mailbox;
    }),
  );
};

/** Read, flag, move, archive and delete, with the list updated before the server answers. */
export const useEmailActions = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [accountId] });

  const keyword = useMutation({
    mutationFn: ({ ids, keyword, on }: { ids: string[]; keyword: string; on: boolean }) =>
      setKeyword(client, accountId, ids, keyword, on),
    onMutate: ({ ids, keyword, on }) => {
      if (keyword === "$seen") adjustUnreadCounts(queryClient, accountId, ids, on);
      patchCachedEmails(queryClient, accountId, ids, (email) => ({
        ...email,
        keywords: on
          ? { ...email.keywords, [keyword]: true }
          : Object.fromEntries(Object.entries(email.keywords).filter(([key]) => key !== keyword)),
      }));
    },
    onSettled: refresh,
  });

  const move = useMutation({
    mutationFn: async ({ ids, from, to }: { ids: string[]; from: string; to: string }) =>
      moveEmails(client, accountId, ids, from, to),
    onMutate: ({ ids }) => patchCachedEmails(queryClient, accountId, ids, () => null),
    onSettled: refresh,
  });

  const destroy = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => destroyEmails(client, accountId, ids),
    onMutate: ({ ids }) => patchCachedEmails(queryClient, accountId, ids, () => null),
    onSettled: refresh,
  });

  /** The archive folder; created on first use, since Stalwart does not set one up. */
  const archiveMailboxId = async (): Promise<string> => {
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
    setSeen: (ids: string[], seen: boolean) =>
      keyword.mutateAsync({ ids, keyword: "$seen", on: seen }),
    setFlagged: (ids: string[], flagged: boolean) =>
      keyword.mutateAsync({ ids, keyword: "$flagged", on: flagged }),
    move: (ids: string[], from: string, to: string) => move.mutateAsync({ ids, from, to }),
    archive: async (ids: string[], from: string) =>
      move.mutateAsync({ ids, from, to: await archiveMailboxId() }),
    /** Moves to the trash; in the trash it deletes for good. */
    remove: async (ids: string[], from: string) => {
      const mailboxes =
        queryClient.getQueryData<Awaited<ReturnType<typeof listMailboxes>>>(
          mailboxesKey(accountId),
        ) ?? [];
      const trash = findRole(mailboxes, "trash");
      if (!trash || trash.id === from) return destroy.mutateAsync({ ids });
      return move.mutateAsync({ ids, from, to: trash.id });
    },
  };
};

export const useCreateMailbox = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      createMailbox(client, accountId, name, parentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mailboxesKey(accountId) }),
  });
};
