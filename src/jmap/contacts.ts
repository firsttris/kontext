/** Contacts over JMAP (draft-ietf-jmap-contacts): address books and JSContact cards. */
import type { ContactCard } from "@/lib/jscontact";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.contacts];

export type AddressBook = {
  id: string;
  name: string;
  isDefault: boolean;
  myRights?: { mayWrite?: boolean };
};

export const listAddressBooks = async (
  client: JmapClient,
  accountId: string,
): Promise<AddressBook[]> =>
  (await client.call<{ list: AddressBook[] }>("AddressBook/get", { accountId }, USING)).list;

export const listContacts = async (client: JmapClient, accountId: string): Promise<ContactCard[]> =>
  (await client.call<{ list: ContactCard[] }>("ContactCard/get", { accountId, ids: null }, USING))
    .list;

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
