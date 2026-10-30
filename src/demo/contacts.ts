/** Contact cards (draft-ietf-jmap-contacts, JSContact RFC 9553): query, get and set. */
import {
  type Args,
  applyPatch,
  type Created,
  changed,
  getList,
  type Result,
  state,
} from "./methods";
import { newId, type Store, type StoredObject } from "./store";

const cardsOf = (store: Store, accountId: string) =>
  [...store.cards.values()].filter((card) => card.accountId === accountId);

/** inAddressBook, uid and a text that appears anywhere in the card. */
const matches = (card: StoredObject, filter: Args | undefined) =>
  !filter ||
  ((!filter.inAddressBook ||
    Boolean((card.addressBookIds as Record<string, boolean>)?.[String(filter.inAddressBook)])) &&
    (!filter.uid || card.uid === filter.uid) &&
    (!filter.text ||
      JSON.stringify(card).toLowerCase().includes(String(filter.text).toLowerCase())));

export const cardQuery = (store: Store, args: Args): Result => {
  const ids = cardsOf(store, String(args.accountId))
    .filter((card) => matches(card, args.filter as Args | undefined))
    .map((card) => card.id);
  const position = Number(args.position ?? 0);
  const limit = args.limit === undefined ? ids.length : Number(args.limit);
  return {
    accountId: args.accountId,
    queryState: state(store),
    canCalculateChanges: false,
    position,
    ids: ids.slice(position, position + limit),
    total: ids.length,
  };
};

export const cardGet = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(cardsOf(store, String(args.accountId)), args, (card) => card),
});

export const cardSet = (store: Store, args: Args, created: Created): Result => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const id = newId(store, `${accountId}-card-`);
    const uid = (value.uid as string | undefined) ?? crypto.randomUUID();
    store.cards.set(id, { "@type": "Card", version: "1.0", ...value, uid, id, accountId });
    created.set(key, id);
    createdOut[key] = { id, uid };
  }
  const updated: Result = {};
  const notUpdated: Result = {};
  for (const [id, patch] of Object.entries((args.update ?? {}) as Record<string, Args>)) {
    const card = store.cards.get(id);
    if (card?.accountId !== accountId) {
      notUpdated[id] = { type: "notFound" };
      continue;
    }
    store.cards.set(id, applyPatch(card, patch));
    updated[id] = null;
  }
  const destroyed: string[] = [];
  for (const id of (args.destroy ?? []) as string[]) {
    if (store.cards.get(id)?.accountId === accountId && store.cards.delete(id)) destroyed.push(id);
  }
  changed(store);
  return {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    destroyed,
    notCreated: {},
    notUpdated,
    notDestroyed: {},
  };
};
