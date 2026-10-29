/**
 * Adding moved contacts and appointments to an account, whatever they came from (vCard,
 * iCalendar, Microsoft Graph): into the default address book or calendar, skipping what is already
 * there (same name and first address; same UID), in batches of 500.
 */
import { prepareEvent } from "../../src/lib/ics-import";
import type { Importer } from "./importer";
import { cardKey, prepareCard } from "./items";
import type { Count } from "./jobs";

const CREATE_BATCH = 500;

export const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export const addCards = async (
  importer: Importer,
  accountId: string,
  cards: Record<string, unknown>[],
  count: Count,
  save: () => Promise<void> = async () => {},
) => {
  if (!cards.length) return;
  const known = new Set(
    (await importer.contacts.known(accountId)).map((card) =>
      cardKey(card as Parameters<typeof cardKey>[0]),
    ),
  );
  const bookId = await importer.contacts.defaultBook(accountId);
  const fresh: Record<string, unknown>[] = [];
  for (const card of cards) {
    const key = cardKey(card as Parameters<typeof cardKey>[0]);
    if (known.has(key)) count.skipped++;
    else {
      known.add(key);
      fresh.push(prepareCard(card, bookId));
    }
  }
  for (const page of chunks(fresh, CREATE_BATCH)) {
    const outcome = await importer.contacts.create(accountId, page);
    count.imported += outcome.imported;
    count.failed += page.length - outcome.imported;
    await save();
  }
};

export const addEvents = async (
  importer: Importer,
  accountId: string,
  events: { event: Record<string, unknown>; uid: string }[],
  count: Count,
  save: () => Promise<void> = async () => {},
) => {
  if (!events.length) return;
  const known = await importer.events.knownUids(accountId);
  const calendarId = await importer.events.defaultCalendar(accountId);
  const fresh: Record<string, unknown>[] = [];
  for (const { event, uid } of events) {
    if (known.has(uid)) count.skipped++;
    else {
      known.add(uid);
      fresh.push(prepareEvent(event, calendarId, uid));
    }
  }
  for (const page of chunks(fresh, CREATE_BATCH)) {
    const outcome = await importer.events.create(accountId, page);
    count.imported += outcome.imported;
    count.failed += page.length - outcome.imported;
    await save();
  }
};
