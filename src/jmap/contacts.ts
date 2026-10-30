/** Contacts over JMAP (draft-ietf-jmap-contacts): address books and JSContact cards. */
import { chunk } from "@/lib/chunk";
import type { ContactCard, Media } from "@/lib/jscontact";
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
  return withInlinePhotos(client, accountId, cards);
};

/** Blob/get calls per request, within Stalwart's `maxCallsInRequest` (16). */
const CALLS_PER_REQUEST = 16;

type StoredPhoto = { card: number; key: string; blobId: string; mediaType: string };

/** The photos Stalwart gives as a blob only, not as a `data:` URI. Pure. */
const storedPhotos = (cards: ContactCard[]): StoredPhoto[] =>
  cards.flatMap((card, index) =>
    Object.entries(card.media ?? {}).flatMap(([key, media]) =>
      media.kind === "photo" && !media.uri && media.blobId
        ? [{ card: index, key, blobId: media.blobId, mediaType: media.mediaType ?? "" }]
        : [],
    ),
  );

/**
 * Stalwart 1.0 keeps a photo stored in a card (`data:` URI) but gives it back as a `blobId`
 * (crates/jmap/src/contact/get.rs, EmbeddedBlobIds). The app shows only photos carried in the
 * card (lib/photo.ts), so their bytes come back with Blob/get (RFC 9404) as `data:` URIs: one call
 * per photo, matched by call id, since Blob/get names the blob with another id.
 */
const withInlinePhotos = async (
  client: JmapClient,
  accountId: string,
  cards: ContactCard[],
): Promise<ContactCard[]> => {
  const photos = storedPhotos(cards);
  if (!photos.length) return cards;
  const data = new Map<StoredPhoto, string>();
  for (const page of chunk(photos, CALLS_PER_REQUEST)) {
    const answers = await client.request(
      page.map((photo, index) => [
        "Blob/get",
        { accountId, ids: [photo.blobId], properties: ["data:asBase64"] },
        String(index),
      ]),
      [...USING, CAPABILITIES.blob],
    );
    for (const [name, args, index] of answers) {
      const base64 = (args.list as { "data:asBase64"?: string }[] | undefined)?.[0]?.[
        "data:asBase64"
      ];
      const photo = page[Number(index)];
      if (name === "Blob/get" && photo && base64) data.set(photo, base64);
    }
  }
  return cards.map((card, index) => {
    const own = photos.filter((photo) => photo.card === index && data.has(photo));
    if (!own.length) return card;
    const media: Record<string, Media> = { ...card.media };
    for (const photo of own) {
      const { blobId: _, ...stored } = media[photo.key]!;
      media[photo.key] = { ...stored, uri: `data:${photo.mediaType};base64,${data.get(photo)}` };
    }
    return { ...card, media };
  });
};

/**
 * Reads vCards with the server's parser (RFC 9555 mapping). `ContactCard/parse` reads one card
 * per blob, so each card becomes its own blob, created inline with `Blob/upload` (RFC 9404) in the
 * same request; 10 cards per request, Stalwart's default limit for `…/parse` (parseLimitContact),
 * which the session does not show.
 */
export const parseVCards = async (
  client: JmapClient,
  accountId: string,
  vcards: string[],
): Promise<(ContactCard | null)[]> => {
  const using = [...USING, CAPABILITIES.blob, CAPABILITIES.contactsParse];
  const results: (ContactCard | null)[] = [];
  for (const page of chunk(vcards, 10)) {
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

/** Changes to several cards of one account in one call, as when duplicates are merged. */
export const setContacts = async (
  client: JmapClient,
  accountId: string,
  { update, destroy }: { update: Record<string, Record<string, unknown>>; destroy: string[] },
): Promise<void> => {
  assertSetOk(
    await client.call("ContactCard/set", { accountId, update, destroy }, USING),
    "Kontakt",
  );
};

/** Deletes many cards of one account, 500 per call (Stalwart's `maxObjectsInSet`). */
export const destroyContacts = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
): Promise<void> => {
  for (const page of chunk(ids, 500)) {
    assertSetOk(
      await client.call("ContactCard/set", { accountId, destroy: page }, USING),
      "Kontakt",
    );
  }
};
