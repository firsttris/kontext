/**
 * Keeps the subscribed calendars up to date: each one every six hours (checked every 15 minutes,
 * one after the other), and at once when it is added or someone asks for it. A calendar its owner
 * deleted ends its subscription.
 */

import type { SubscribedCalendars } from "./calendars";
import { type FetchDeps, fetchCalendar } from "./fetch-calendar";
import type { Subscription, SubscriptionStore } from "./store";
import { eventsByUid, syncPlan } from "./sync-plan";

export const EVERY_MS = 6 * 60 * 60_000;
const TICK_MS = 15 * 60_000;

/** Whether a subscription is due: never fetched, or the last run is six hours ago. */
export const isDue = (subscription: Pick<Subscription, "lastSyncAt">, now: Date): boolean =>
  !subscription.lastSyncAt || now.getTime() - subscription.lastSyncAt.getTime() >= EVERY_MS;

export const createSubscriptionRunner = ({
  store,
  calendars,
  fetchDeps = {},
  now = () => new Date(),
}: {
  store: SubscriptionStore;
  calendars: SubscribedCalendars;
  fetchDeps?: FetchDeps;
  now?: () => Date;
}) => {
  /**
   * One run per subscription at a time: a refresh, the tick and the first write would otherwise
   * both read the calendar before either writes, and create its events twice.
   */
  const running = new Map<string, Promise<unknown>>();
  const oneAtATime = <T>(id: string, run: () => Promise<T>): Promise<T> => {
    const next = (running.get(id) ?? Promise.resolve()).catch(() => {}).then(run);
    running.set(id, next);
    void next
      .catch(() => {})
      .finally(() => {
        if (running.get(id) === next) running.delete(id);
      });
    return next;
  };

  /** Writes the file's events into the calendar; the error is kept with the subscription. */
  const writeNow = async (subscription: Subscription, text: string): Promise<string | null> => {
    try {
      const entries = await calendars.parse(subscription.accountId, text);
      if (!entries.length && /BEGIN:VEVENT/i.test(text)) {
        throw new Error("Der Kalender lässt sich nicht lesen.");
      }
      const plan = syncPlan(
        eventsByUid(entries),
        await calendars.events(subscription.accountId, subscription.calendarId),
        JSON.parse(subscription.written) as Record<string, string>,
      );
      await calendars.apply(subscription.accountId, subscription.calendarId, plan);
      await store.synced(subscription.id, { written: plan.written }, now());
      return null;
    } catch (error) {
      const message = (error as Error).message;
      await store.synced(subscription.id, { error: message }, now());
      return message;
    }
  };

  const write = (subscription: Subscription, text: string) =>
    oneAtATime(subscription.id, () => writeNow(subscription, text));

  /** Fetches and writes one subscription; the error, or null ("gone" when the calendar is). */
  const sync = (subscription: Subscription) =>
    oneAtATime(subscription.id, () => syncNow(subscription));

  const syncNow = async (subscription: Subscription): Promise<string | null> => {
    try {
      if (!(await calendars.exists(subscription.accountId, subscription.calendarId))) {
        await store.remove(subscription.memberId, subscription.id);
        return "gone";
      }
    } catch (error) {
      // Kept with the subscription, so it waits its six hours instead of blocking the others.
      const message = (error as Error).message;
      await store.synced(subscription.id, { error: message }, now());
      return message;
    }
    const fetched = await fetchCalendar(subscription.url, fetchDeps);
    if (!fetched.ok) {
      await store.synced(subscription.id, { error: fetched.error }, now());
      return fetched.error;
    }
    return writeNow(subscription, fetched.text);
  };

  /** One subscription after the other; one that fails does not stop the rest. */
  const tick = async () => {
    for (const subscription of await store.all()) {
      if (!isDue(subscription, now())) continue;
      await sync(subscription).catch((error: Error) =>
        console.warn(`Kalender-Abo ${subscription.id}: ${error.message}`),
      );
    }
  };

  const start = () => {
    void tick().catch((error: Error) => console.warn(`Kalender-Abos: ${error.message}`));
    return setInterval(
      () => void tick().catch((error: Error) => console.warn(`Kalender-Abos: ${error.message}`)),
      TICK_MS,
    );
  };

  return { sync, write, tick, start };
};

export type SubscriptionRunner = ReturnType<typeof createSubscriptionRunner>;
