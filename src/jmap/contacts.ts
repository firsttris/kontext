/** Contacts over JMAP (draft-ietf-jmap-contacts): address books and JSContact cards. */
import type { ContactCard } from "@/lib/jscontact";
import type { Rights, ShareWith } from "@/lib/sharing";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.contacts];

export type AddressBook = {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder?: number;
  /** Only the owner sees whom it is shared with. */
  shareWith?: ShareWith | null;
  myRights?: Rights;
};

export const listAddressBooks = async (
  client: JmapClient,
  accountId: string,
): Promise<AddressBook[]> =>
  (await client.call<{ list: AddressBook[] }>("AddressBook/get", { accountId }, USING)).list;

/**
 * The cards of one address book. Always asked per book, also in shared accounts, so the list
 * holds exactly what is in the books the user can see.
 */
export const listContacts = async (
  client: JmapClient,
  accountId: string,
  addressBookId: string,
): Promise<ContactCard[]> => {
  const [, get] = await client.request(
    [
      [
        "ContactCard/query",
        { accountId, filter: { inAddressBook: addressBookId }, limit: 10_000 },
        "q",
      ],
      [
        "ContactCard/get",
        { accountId, "#ids": { resultOf: "q", name: "ContactCard/query", path: "/ids" } },
        "g",
      ],
    ],
    USING,
  );
  return (get![1].list as ContactCard[]) ?? [];
};

export const createAddressBook = async (
  client: JmapClient,
  accountId: string,
  name: string,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "AddressBook/set",
    { accountId, create: { b: { name } } },
    USING,
  );
  assertSetOk(result, "Adressbuch");
  return result.created!.b!.id;
};

/** Deletes the book together with its contacts. */
export const deleteAddressBook = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "AddressBook/set",
      { accountId, destroy: [id], onDestroyRemoveContents: true },
      USING,
    ),
    "Adressbuch",
  );
};

export const shareAddressBook = async (
  client: JmapClient,
  accountId: string,
  id: string,
  shareWith: ShareWith,
): Promise<void> => {
  assertSetOk(
    await client.call("AddressBook/set", { accountId, update: { [id]: { shareWith } } }, USING),
    "Adressbuch",
  );
};

export const createContact = async (
  client: JmapClient,
  accountId: string,
  addressBookId: string,
  card: Record<string, unknown>,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "ContactCard/set",
    {
      accountId,
      create: {
        c: {
          "@type": "Card",
          version: "1.0",
          kind: "individual",
          uid: crypto.randomUUID(),
          addressBookIds: { [addressBookId]: true },
          ...Object.fromEntries(Object.entries(card).filter(([, value]) => value !== undefined)),
        },
      },
    },
    USING,
  );
  assertSetOk(result, "Kontakt");
  return result.created!.c!.id;
};

/** Replaces the edited properties; `undefined` values become `null`, which removes them. */
export const updateContact = async (
  client: JmapClient,
  accountId: string,
  id: string,
  card: Record<string, unknown>,
): Promise<void> => {
  const patch = Object.fromEntries(
    Object.entries(card).map(([key, value]) => [key, value ?? null]),
  );
  assertSetOk(
    await client.call("ContactCard/set", { accountId, update: { [id]: patch } }, USING),
    "Kontakt",
  );
};

export const deleteContact = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<void> => {
  assertSetOk(await client.call("ContactCard/set", { accountId, destroy: [id] }, USING), "Kontakt");
};
