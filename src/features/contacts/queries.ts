import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import {
  createContact,
  deleteContact,
  listAddressBooks,
  listContacts,
  updateContact,
} from "@/jmap/contacts";

/** The user's own contacts account. */
export const useContactsAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.contacts];
};

export const contactsKey = (accountId: string | undefined) => [accountId, "contacts"] as const;

export const useContacts = () => {
  const client = useClient();
  const accountId = useContactsAccountId();
  return useQuery({
    queryKey: contactsKey(accountId),
    queryFn: () => listContacts(client, accountId!),
    enabled: Boolean(accountId),
  });
};

export const useAddressBooks = () => {
  const client = useClient();
  const accountId = useContactsAccountId();
  return useQuery({
    queryKey: [accountId, "addressBooks"],
    queryFn: () => listAddressBooks(client, accountId!),
    enabled: Boolean(accountId),
  });
};

export const useContactMutations = () => {
  const client = useClient();
  const accountId = useContactsAccountId();
  const queryClient = useQueryClient();
  const { data: books = [] } = useAddressBooks();
  const refresh = () => queryClient.invalidateQueries({ queryKey: contactsKey(accountId) });

  const create = useMutation({
    mutationFn: (card: Record<string, unknown>) => {
      const book = books.find((b) => b.isDefault) ?? books[0];
      if (!accountId || !book) throw new Error("Kein Adressbuch");
      return createContact(client, accountId, book.id, card);
    },
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, card }: { id: string; card: Record<string, unknown> }) =>
      updateContact(client, accountId!, id, card),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteContact(client, accountId!, id),
    onSettled: refresh,
  });
  return { create, update, remove };
};
