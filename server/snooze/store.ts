/** Wiedervorlagen in Kontext's SQLite, and the sign-ins that can bring them back. */
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { Snooze } from "./snooze";

export type SnoozeStore = {
  list: (accountId: string) => Promise<Snooze[]>;
  put: (snoozes: Snooze[], userId: string) => Promise<void>;
  remove: (accountId: string, emailIds: string[]) => Promise<void>;
  /** What is due now, the oldest first. */
  due: (now: Date) => Promise<(Snooze & { userId: string })[]>;
  /** Whose sign-in session asks. */
  userOf: (sessionId: string) => Promise<string | null>;
  /**
   * Sessions to act with: the newest of this person first, then the newest of everyone else –
   * in a shared mailbox a colleague can bring it back when the one who put it away is signed out.
   */
  sessionsFor: (userId: string) => Promise<string[]>;
};

type Row = typeof schema.snoozes.$inferSelect;
const toSnooze = ({ accountId, emailId, until, by }: Row): Snooze => ({
  accountId,
  emailId,
  until: until.toISOString(),
  by,
});

export const createSnoozeStore = (db: Db): SnoozeStore => ({
  list: async (accountId) =>
    (
      await db
        .select()
        .from(schema.snoozes)
        .where(eq(schema.snoozes.accountId, accountId))
        .orderBy(asc(schema.snoozes.until))
    ).map(toSnooze),
  put: async (snoozes, userId) => {
    if (!snoozes.length) return;
    const createdAt = new Date();
    for (const snooze of snoozes) {
      const row = { ...snooze, until: new Date(snooze.until), userId, createdAt };
      await db
        .insert(schema.snoozes)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.snoozes.accountId, schema.snoozes.emailId],
          set: { until: row.until, userId, by: row.by },
        });
    }
  },
  remove: async (accountId, emailIds) => {
    if (!emailIds.length) return;
    await db
      .delete(schema.snoozes)
      .where(
        and(eq(schema.snoozes.accountId, accountId), inArray(schema.snoozes.emailId, emailIds)),
      );
  },
  due: async (now) =>
    (
      await db
        .select()
        .from(schema.snoozes)
        .where(lte(schema.snoozes.until, now))
        .orderBy(asc(schema.snoozes.until))
    ).map((row) => ({ ...toSnooze(row), userId: row.userId })),
  userOf: async (sessionId) => {
    const [row] = await db
      .select({ userId: schema.session.userId })
      .from(schema.session)
      .where(eq(schema.session.id, sessionId));
    return row?.userId ?? null;
  },
  sessionsFor: async (userId) => {
    const rows = await db
      .select({ id: schema.session.id, userId: schema.session.userId })
      .from(schema.session)
      .innerJoin(schema.stalwartGrant, eq(schema.stalwartGrant.sessionId, schema.session.id))
      .orderBy(desc(schema.session.updatedAt));
    const seen = new Set<string>();
    const newest = rows.filter((row) => !seen.has(row.userId) && seen.add(row.userId));
    return [
      ...newest.filter((row) => row.userId === userId),
      ...newest.filter((row) => row.userId !== userId),
    ].map((row) => row.id);
  },
});
