/**
 * Calendars and address books (draft-ietf-jmap-calendars, draft-ietf-jmap-contacts): get and set
 * on the store, alike for both. Deleting one deletes what is in it, as Stalwart does with
 * `onDestroyRemoveEvents` (and always for address books).
 */
import { type Args, type Created, changed, getList, type Result, state } from "./methods";
import { newId, type Store, type StoredCollection, type StoredObject } from "./store";

export type Kind = "calendar" | "addressBook";

const RIGHTS = {
  mayReadItems: true,
  mayWriteAll: true,
  mayWriteOwn: true,
  mayUpdatePrivate: true,
  mayRSVP: true,
  mayAdmin: true,
  mayDelete: true,
  mayReadFreeBusy: true,
};

const collectionsOf = (store: Store, kind: Kind) =>
  kind === "calendar" ? store.calendars : store.addressBooks;

/** What a collection holds: events in calendars, cards in address books. */
const itemsOf = (store: Store, kind: Kind): Map<string, StoredObject> =>
  kind === "calendar" ? store.events : store.cards;

const membership = (kind: Kind) => (kind === "calendar" ? "calendarIds" : "addressBookIds");

export const defaultCollection = (store: Store, kind: Kind, accountId: string) =>
  [...collectionsOf(store, kind).values()].find(
    (collection) => collection.accountId === accountId && collection.isDefault,
  );

export const collectionGet = (store: Store, kind: Kind, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(
    [...collectionsOf(store, kind).values()].filter((c) => c.accountId === args.accountId),
    args,
    (collection) => ({ isVisible: true, color: null, myRights: RIGHTS, ...collection }),
  ),
});

export const collectionSet = (store: Store, kind: Kind, args: Args, created: Created): Result => {
  const accountId = String(args.accountId);
  const collections = collectionsOf(store, kind);
  const createdOut: Result = {};
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const id = newId(store, `${accountId}-${kind}-`);
    collections.set(id, { ...value, id, accountId, name: String(value.name), isDefault: false });
    created.set(key, id);
    createdOut[key] = { id };
  }
  const updated: Result = {};
  for (const [id, patch] of Object.entries((args.update ?? {}) as Record<string, Args>)) {
    const collection = collections.get(id);
    if (!collection) continue;
    collections.set(id, { ...collection, ...patch } as StoredCollection);
    updated[id] = null;
  }
  const destroyed: string[] = [];
  const items = itemsOf(store, kind);
  for (const id of (args.destroy ?? []) as string[]) {
    if (!collections.delete(id)) continue;
    for (const item of [...items.values()]) {
      if ((item[membership(kind)] as Record<string, boolean> | undefined)?.[id]) {
        items.delete(item.id);
      }
    }
    destroyed.push(id);
  }
  changed(store);
  return {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    destroyed,
    notCreated: {},
    notUpdated: {},
    notDestroyed: {},
  };
};
