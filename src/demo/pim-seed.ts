/**
 * The seed's calendars and contacts for the demo: every account gets the default calendar and
 * address book Stalwart creates, named as it names them (`defaultDisplayName`,
 * crates/registry/src/schema/structs_impl.rs). The events and cards are dev/seed-objects.ts's;
 * colleagues invited to an event have it in their calendar too, waiting for their answer.
 */
import { contactGroups, contacts, events } from "../../dev/seed-data";
import { calendarEvent, contactCard, groupCard } from "../../dev/seed-objects";
import { inviteColleagues } from "./events";
import type { Store, StoredObject } from "./store";

const calendarId = (accountId: string) => `${accountId}-calendar`;
const addressBookId = (accountId: string) => `${accountId}-contacts`;

/** Adds the calendars, address books, events and cards; dates are relative to `now`. */
export const seedPim = (store: Store, now: number): void => {
  for (const account of store.accounts) {
    store.calendars.set(calendarId(account.id), {
      id: calendarId(account.id),
      accountId: account.id,
      name: "Stalwart Calendar",
      isDefault: true,
      sortOrder: 0,
    });
    store.addressBooks.set(addressBookId(account.id), {
      id: addressBookId(account.id),
      accountId: account.id,
      name: "Stalwart Address Book",
      isDefault: true,
      sortOrder: 0,
    });
  }
  const cards = [
    ...contacts.map((c) => ({ owner: c.owner, card: contactCard(c, addressBookId(c.owner), now) })),
    ...contactGroups.map((g) => ({ owner: g.owner, card: groupCard(g, addressBookId(g.owner)) })),
  ];
  for (const { owner, card } of cards) {
    const id = `${owner}-card-${card.uid}`;
    store.cards.set(id, { ...card, id, accountId: owner });
  }
  for (const seed of events) {
    const id = `${seed.owner}-event-${seed.uid}`;
    const event: StoredObject = {
      ...calendarEvent(seed, calendarId(seed.owner), now),
      id,
      accountId: seed.owner,
    };
    store.events.set(id, event);
    inviteColleagues(store, event);
  }
};
