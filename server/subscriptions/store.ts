/** The subscriptions in Kontext's SQLite; Stalwart only holds the calendars and their events. */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type Subscription = typeof schema.calendarSubscription.$inferSelect;

export type SubscriptionStore = {
  all: () => Promise<Subscription[]>;
  of: (memberId: string) => Promise<Subscription[]>;
  get: (memberId: string, id: string) => Promise<Subscription | null>;
  add: (subscription: Omit<Subscription, "written" | "lastSyncAt" | "lastError">) => Promise<void>;
  /** After a run: what was written, or the error that stopped it. */
  synced: (
    id: string,
    result: { written: Record<string, string> } | { error: string },
    at: Date,
  ) => Promise<void>;
  remove: (memberId: string, id: string) => Promise<void>;
};

export const createSubscriptionStore = (db: Db): SubscriptionStore => {
  const table = schema.calendarSubscription;
  return {
    all: () => db.select().from(table),
    of: (memberId) => db.select().from(table).where(eq(table.memberId, memberId)),
    get: async (memberId, id) =>
      (
        await db
          .select()
          .from(table)
          .where(and(eq(table.memberId, memberId), eq(table.id, id)))
      )[0] ?? null,
    add: async (subscription) => {
      await db.insert(table).values(subscription);
    },
    synced: async (id, result, at) => {
      await db
        .update(table)
        .set(
          "error" in result
            ? { lastSyncAt: at, lastError: result.error }
            : { lastSyncAt: at, lastError: null, written: JSON.stringify(result.written) },
        )
        .where(eq(table.id, id));
    },
    remove: async (memberId, id) => {
      await db.delete(table).where(and(eq(table.memberId, memberId), eq(table.id, id)));
    },
  };
};
