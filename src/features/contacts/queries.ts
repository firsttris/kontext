/**
 * Address books and contacts of every account the user can see: the own one, shared mailboxes
 * like info@, and colleagues who shared an address book.
 */
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import {
  type AddressBook,
  createAddressBook,
  createContact,
  deleteAddressBook,
  deleteContact,
  listAddressBooks,
  listContacts,
  setContacts,
  shareAddressBook,
  updateContact,
} from "@/jmap/contacts";
import { principalName } from "@/jmap/principals";
import { mergePlan } from "@/lib/contact-duplicates";
import type { ContactCard } from "@/lib/jscontact";
import type { ShareWith } from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { usePrincipals } from "../sharing/queries";

/** An address book together with the account it lives in. */
export type BookRef = {
  /** `accountId:bookId`, unique across accounts; used in the URL. */
  key: string;
  accountId: string;
  isPersonal: boolean;
  /** Who it belongs to: a colleague's name or a shared mailbox like "info@". */
  owner: string;
  name: string;
  book: AddressBook;
  mayWrite: boolean;
};

/** A card and the account it lives in (card ids are only unique within an account). */
export type Contact = ContactCard & { accountId: string };

export const contactKey = (contact: { accountId: string; id: string }): string =>
  `${contact.accountId}/${contact.id}`;

/** The user's own contacts account. */
export const useContactsAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.contacts];
};

const useContactAccounts = () => {
  const { data: session } = useSession();
  if (!session) return [];
  return Object.entries(session.accounts)
    .filter(([, account]) => CAPABILITIES.contacts in account.accountCapabilities)
    .map(([id, account]) => ({ id, ...account }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));
};

/** Stalwart names the default book "Stalwart Address Book (…)"; the app calls it by its owner. */
const bookName = (book: AddressBook, own: boolean, owner: string): string =>
  /^Stalwart Address Book/.test(book.name) ? (own ? m.contacts_my_book() : owner) : book.name;

/** All address books the user can read: own ones first, then shared mailboxes and colleagues. */
export const useBooks = (): { books: BookRef[]; isPending: boolean } => {
  const client = useClient();
  const accounts = useContactAccounts();
  const { data: principals = [] } = usePrincipals();
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: [account.id, "addressBooks"],
      queryFn: () => listAddressBooks(client, account.id),
    })),
  });
  const books = accounts.flatMap((account, index) => {
    const principal = principals.find((p) => p.id === account.id);
    const owner =
      principal?.type === "group"
        ? account.name.replace(/@.*/, "@")
        : principal
          ? principalName(principal)
          : account.name;
    return (results[index]?.data ?? [])
      .filter((book) => book.myRights?.mayRead !== false)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
      .map(
        (book): BookRef => ({
          key: `${account.id}:${book.id}`,
          accountId: account.id,
          isPersonal: account.isPersonal,
          owner,
          name: bookName(book, account.isPersonal, owner),
          book,
          mayWrite: account.isPersonal || Boolean(book.myRights?.mayWrite),
        }),
      );
  });
  return { books, isPending: results.some((result) => result.isPending) };
};

/** The contacts of all readable address books, or of one (`bookKey`). */
export const useContacts = (bookKey?: string) => {
  const client = useClient();
  const { books, isPending: booksPending } = useBooks();
  const shown = bookKey ? books.filter((book) => book.key === bookKey) : books;
  const results = useQueries({
    queries: shown.map((book) => ({
      queryKey: [book.accountId, "contacts", book.book.id],
      queryFn: () => listContacts(client, book.accountId, book.book.id),
    })),
  });
  const seen = new Set<string>();
  const contacts: Contact[] = [];
  shown.forEach((book, index) => {
    for (const card of results[index]?.data ?? []) {
      const contact = { ...card, accountId: book.accountId };
      if (seen.has(contactKey(contact))) continue;
      seen.add(contactKey(contact));
      contacts.push(contact);
    }
  });
  return {
    data: contacts,
    books,
    isPending: booksPending || results.some((result) => result.isPending),
  };
};

/** "Kunden · Jonas Weber"; own books and colleagues' default books by their name alone. */
export const bookLabel = (book: BookRef): string =>
  book.isPersonal || book.name === book.owner
    ? book.name
    : m.contacts_book_of({ book: book.name, owner: book.owner });

/** Where a new contact or group goes: the shown book if writable, else the own default book. */
export const startBook = (writable: BookRef[], preferred?: string): string =>
  (
    writable.find((book) => book.key === preferred) ??
    writable.find((book) => book.isPersonal && book.book.isDefault) ??
    writable[0]
  )?.key ?? "";

/** The book a contact is in (the first one it belongs to that the user can see). */
export const bookOf = (books: BookRef[], contact: Contact): BookRef | undefined =>
  books.find(
    (book) => book.accountId === contact.accountId && contact.addressBookIds[book.book.id],
  );

export const useContactMutations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const refresh = (accountId: string) =>
    queryClient.invalidateQueries({ queryKey: [accountId, "contacts"] });

  const create = useMutation({
    mutationFn: ({ card, book }: { card: Record<string, unknown>; book: BookRef }) =>
      createContact(client, book.accountId, book.book.id, card),
    onSettled: (_data, _error, { book }) => refresh(book.accountId),
  });
  const update = useMutation({
    mutationFn: ({ contact, card }: { contact: Contact; card: Record<string, unknown> }) =>
      updateContact(client, contact.accountId, contact.id, card),
    onSettled: (_data, _error, { contact }) => refresh(contact.accountId),
  });
  const remove = useMutation({
    mutationFn: (contact: Contact) => deleteContact(client, contact.accountId, contact.id),
    onSettled: (_data, _error, contact) => refresh(contact.accountId),
  });
  /** Each set of duplicates (all in one account) becomes one card; `groups` are the account's. */
  const merge = useMutation({
    mutationFn: ({ sets, groups }: { sets: Contact[][]; groups: Contact[] }) =>
      setContacts(client, sets[0]![0]!.accountId, mergePlan(sets, groups)),
    onSettled: (_data, _error, { sets }) => refresh(sets[0]![0]!.accountId),
  });
  return { create, update, remove, merge };
};

export const useBookMutations = () => {
  const client = useClient();
  const accountId = useContactsAccountId();
  const queryClient = useQueryClient();
  const refresh = (account: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [account, "addressBooks"] }),
      queryClient.invalidateQueries({ queryKey: [account, "contacts"] }),
    ]);

  const createBook = useMutation({
    mutationFn: (name: string) => createAddressBook(client, accountId!, name),
    onSettled: () => refresh(accountId!),
  });
  const deleteBook = useMutation({
    mutationFn: (book: BookRef) => deleteAddressBook(client, book.accountId, book.book.id),
    onSettled: (_data, _error, book) => refresh(book.accountId),
  });
  const shareBook = useMutation({
    mutationFn: ({ book, shareWith }: { book: BookRef; shareWith: ShareWith }) =>
      shareAddressBook(client, book.accountId, book.book.id, shareWith),
    onSettled: (_data, _error, { book }) => refresh(book.accountId),
  });
  return { createBook, deleteBook, shareBook };
};
