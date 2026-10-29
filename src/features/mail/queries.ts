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
  type EmailFilter,
  type EmailPage,
  getEmail,
  getQuota,
  listIdentities,
  listMailboxes,
  queryEmails,
} from "@/jmap/mail";
import { heldMails } from "@/jmap/submissions";
import type { Account, EmailSummary, Mailbox } from "@/jmap/types";
import type { MailAccount } from "@/lib/mail-accounts";
import { DEFAULT_SORT, type MailSort, sortComparators } from "@/lib/mail-sort";
import { findRole } from "@/lib/mailboxes";
import { useCategories } from "../categories/queries";
import { usePrincipals } from "../sharing/queries";

export const mailboxesKey = (accountId: string) => [accountId, "mailboxes"] as const;

/**
 * Mail accounts the user can open: the own one first, then shared mailboxes like info@, then
 * mailboxes of former colleagues handed over by the Firmenverwaltung. A colleague who shares only
 * an address book or calendar also shows up as an account in the session; such an account counts
 * only if it is a group or shows folders.
 */
export const useMailAccounts = (): MailAccount[] => {
  const client = useClient();
  const { data: session } = useSession();
  const { data: principals = [] } = usePrincipals();
  const groups = new Set(principals.filter((p) => p.type === "group").map((p) => p.id));
  const candidates = Object.entries(session?.accounts ?? {})
    .filter(([, account]) => CAPABILITIES.mail in account.accountCapabilities)
    .map(([id, account]) => ({ id, ...account }));
  const others = candidates.filter((a) => !a.isPersonal && !groups.has(a.id));
  const folders = useQueries({
    queries: others.map((account) => ({
      queryKey: mailboxesKey(account.id),
      queryFn: () => listMailboxes(client, account.id),
      retry: false,
    })),
  });
  const handedOver = new Set(
    others.filter((_, index) => (folders[index]?.data?.length ?? 0) > 0).map((a) => a.id),
  );
  const kind = (a: Account): MailAccount["kind"] =>
    a.isPersonal ? "own" : groups.has(a.id) ? "shared" : "handedOver";
  const rank = { own: 0, shared: 1, handedOver: 2 };
  return candidates
    .filter((a) => a.isPersonal || groups.has(a.id) || handedOver.has(a.id))
    .map((a) => ({ ...a, kind: kind(a) }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
};

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
export const useInboxes = (): { account: MailAccount; mailbox: Mailbox }[] => {
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

/**
 * A folder's mails in the chosen order (newest first by default); with `collapse`, one line per
 * conversation. Sorting by category needs the account's categories, in its order.
 */
export const useEmailList = (
  accountId: string,
  filter: EmailFilter,
  { collapse = false, sort = DEFAULT_SORT }: { collapse?: boolean; sort?: MailSort } = {},
) => {
  const client = useClient();
  const categories = useCategories(sort === "category" ? accountId : undefined).map(
    (category) => category.keyword,
  );
  const comparators = sortComparators(sort, { threads: collapse, categories });
  return useInfiniteQuery({
    queryKey: [accountId, "emails", filter, collapse, comparators],
    queryFn: ({ pageParam }) =>
      queryEmails(client, accountId, filter, pageParam, 50, {
        collapseThreads: collapse,
        sort: comparators,
      }),
    // No account: nothing to list (e.g. "wieder vorgelegt" outside the inbox).
    enabled: Boolean(accountId),
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
/**
 * A paged mail list. Other queries share the `[accountId, "emails"]` prefix with a plain array
 * (the last mails with a person, sender-panel.tsx and the contact view); they are left alone.
 */
const isListData = (data: unknown): data is ListData =>
  typeof data === "object" && data !== null && "pages" in data;

/** Applies a change to the given mails of one cached list; null drops a mail. */
export const patchListData = <T>(
  data: T,
  ids: string[],
  patch: (email: EmailSummary) => EmailSummary | null,
): T => {
  if (!isListData(data)) return data;
  const wanted = new Set(ids);
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      emails: page.emails.flatMap((email) => {
        if (!wanted.has(email.id)) return [email];
        const next = patch(email);
        return next ? [next] : [];
      }),
    })),
  };
};

export const patchCachedEmails = (
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  ids: string[],
  patch: (email: EmailSummary) => EmailSummary | null,
) =>
  queryClient.setQueriesData<unknown>({ queryKey: [accountId, "emails"] }, (data: unknown) =>
    patchListData(data, ids, patch),
  );

/** Keeps the unread counters of the folders right while a read/unread change is on its way. */
export const adjustUnreadCounts = (
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  ids: string[],
  seen: boolean,
) => {
  const wanted = new Set(ids);
  const changed = new Map<string, EmailSummary>();
  for (const [, data] of queryClient.getQueriesData<unknown>({
    queryKey: [accountId, "emails"],
  })) {
    const emails = isListData(data) ? data.pages.flatMap((page) => page.emails) : [];
    for (const email of emails) {
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

export const useCreateMailbox = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      createMailbox(client, accountId, name, parentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mailboxesKey(accountId) }),
  });
};

/** Mails the server still holds in this account: scheduled ones, and those within "Rückgängig". */
export const useHeldMails = (accountId: string) => {
  const client = useClient();
  return (
    useQuery({
      queryKey: [accountId, "held"],
      queryFn: () => heldMails(client, accountId),
      enabled: Boolean(accountId),
    }).data ?? []
  );
};
