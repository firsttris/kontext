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
  const { ids } = await client.call<{ ids: string[] }>(
    "ContactCard/query",
    { accountId, filter: { inAddressBook: addressBookId }, limit: 100_000 },
    USING,
  );
  // Stalwart returns at most `maxObjectsInGet` (500) cards per call; one call after the other
  // stays within `maxConcurrentRequests`.
  const cards: ContactCard[] = [];
  for (const page of chunk(ids, 500)) {
    const { list } = await client.call<{ list: ContactCard[] }>(
      "ContactCard/get",
      { accountId, ids: page },
      USING,
    );
    cards.push(...list);
  }
  return cards;
};

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

/**
 * Reads vCards with the server's parser (RFC 9555 mapping). `ContactCard/parse` reads one card
 * per blob, so each card becomes its own blob, created inline with `Blob/upload` (RFC 9404) in the
 * same request; 50 cards per request.
 */
export const parseVCards = async (
  client: JmapClient,
  accountId: string,
  vcards: string[],
): Promise<(ContactCard | null)[]> => {
  const using = [...USING, CAPABILITIES.blob, CAPABILITIES.contactsParse];
  const results: (ContactCard | null)[] = [];
  for (const page of chunk(vcards, 50)) {
    const create = Object.fromEntries(
      page.map((text, i) => [`v${i}`, { data: [{ "data:asText": text }], type: "text/vcard" }]),
    );
    const [upload, parse] = await client.request(
      [
        ["Blob/upload", { accountId, create }, "u"],
        ["ContactCard/parse", { accountId, blobIds: page.map((_, i) => `#v${i}`) }, "p"],
      ],
      using,
    );
    const blobs = (upload![1].created ?? {}) as Record<string, { id: string }>;
    const parsed = (parse![1].parsed ?? {}) as Record<string, ContactCard>;
    results.push(
      ...page.map((_, i) => {
        const blobId = blobs[`v${i}`]?.id;
        return blobId ? (parsed[blobId] ?? null) : null;
      }),
    );
  }
  return results;
};

/** Creates many cards in one book, 500 per call. Returns how many were created. */
export const createContacts = async (
  client: JmapClient,
  accountId: string,
  addressBookId: string,
  cards: Record<string, unknown>[],
): Promise<number> => {
  let created = 0;
  for (const page of chunk(cards, 500)) {
    const create = Object.fromEntries(
      page.map((card, i) => [
        `c${i}`,
        {
          ...card,
          "@type": "Card",
          version: "1.0",
          uid: (card.uid as string | undefined) ?? crypto.randomUUID(),
          addressBookIds: { [addressBookId]: true },
        },
      ]),
    );
    const result = await client.call<{ created?: Record<string, unknown> }>(
      "ContactCard/set",
      { accountId, create },
      USING,
    );
    assertSetOk(result, "Kontakt");
    created += Object.keys(result.created ?? {}).length;
  }
  return created;
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
