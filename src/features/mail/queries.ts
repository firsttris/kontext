/**
 * Data hooks of the mail app. Query keys start with the JMAP account id, so a push for that
 * account refreshes exactly its data.
 */
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
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
import type { Account, EmailSummary } from "@/jmap/types";
import { findRole } from "@/lib/mailboxes";

/** Mail accounts the user can open: the own one first, then shared mailboxes like info@. */
export const useMailAccounts = (): Account[] => {
  const { data: session } = useSession();
  if (!session) return [];
  return Object.entries(session.accounts)
    .filter(([, account]) => CAPABILITIES.mail in account.accountCapabilities)
    .map(([id, account]) => ({ id, ...account }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));
};

export const mailboxesKey = (accountId: string) => [accountId, "mailboxes"] as const;

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

export const useIdentities = (accountId: string) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "identities"],
    queryFn: () => listIdentities(client, accountId),
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

/** Read, flag, move, archive and delete, with the list updated before the server answers. */
export const useEmailActions = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [accountId] });

  const keyword = useMutation({
    mutationFn: ({ ids, keyword, on }: { ids: string[]; keyword: string; on: boolean }) =>
      setKeyword(client, accountId, ids, keyword, on),
    onMutate: ({ ids, keyword, on }) =>
      patchCachedEmails(queryClient, accountId, ids, (email) => ({
        ...email,
        keywords: on
          ? { ...email.keywords, [keyword]: true }
          : Object.fromEntries(Object.entries(email.keywords).filter(([key]) => key !== keyword)),
      })),
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
