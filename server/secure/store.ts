/** Confidential messages in Kontext's SQLite, their encrypted content in files beside it. */
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { asc, desc, eq, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type SecureRow = typeof schema.secureMessages.$inferSelect;
export type ReplyRow = typeof schema.secureReplies.$inferSelect;

export const createSecureStore = (db: Db, dir: string) => {
  mkdirSync(dir, { recursive: true });
  // Ids are UUIDs made here: no path tricks.
  const pathOf = (id: string) => join(dir, id);

  const get = async (id: string): Promise<SecureRow | null> => {
    const [row] = await db
      .select()
      .from(schema.secureMessages)
      .where(eq(schema.secureMessages.id, id));
    return row ?? null;
  };

  return {
    get,
    create: async (
      row: Omit<SecureRow, "failedTries" | "openedAt" | "openCount">,
      ciphertext: string,
    ) => {
      await Bun.write(pathOf(row.id), ciphertext);
      await db.insert(schema.secureMessages).values(row);
    },
    content: async (id: string) => Bun.file(pathOf(id)).text(),
    ofMember: async (memberId: string) => {
      const rows = await db
        .select()
        .from(schema.secureMessages)
        .where(eq(schema.secureMessages.memberId, memberId))
        .orderBy(desc(schema.secureMessages.createdAt));
      const counts = await db
        .select({
          messageId: schema.secureReplies.messageId,
          replies: sql<number>`count(*)`,
          unread: sql<number>`sum(case when ${schema.secureReplies.readAt} is null then 1 else 0 end)`,
        })
        .from(schema.secureReplies)
        .groupBy(schema.secureReplies.messageId);
      return rows.map((row) => ({
        ...row,
        replies: counts.find((c) => c.messageId === row.id)?.replies ?? 0,
        unreadReplies: counts.find((c) => c.messageId === row.id)?.unread ?? 0,
      }));
    },
    replies: async (messageId: string) =>
      db
        .select()
        .from(schema.secureReplies)
        .where(eq(schema.secureReplies.messageId, messageId))
        .orderBy(asc(schema.secureReplies.createdAt)),
    addReply: async (messageId: string, ciphertext: string) => {
      await db.insert(schema.secureReplies).values({
        id: crypto.randomUUID(),
        messageId,
        ciphertext,
        createdAt: new Date(),
        readAt: null,
      });
    },
    markRepliesRead: async (messageId: string) => {
      await db
        .update(schema.secureReplies)
        .set({ readAt: new Date() })
        .where(eq(schema.secureReplies.messageId, messageId));
    },
    failed: async (id: string) => {
      await db
        .update(schema.secureMessages)
        .set({ failedTries: sql`${schema.secureMessages.failedTries} + 1` })
        .where(eq(schema.secureMessages.id, id));
    },
    opened: async (id: string, at: Date) => {
      await db
        .update(schema.secureMessages)
        .set({
          failedTries: 0,
          openedAt: sql`coalesce(${schema.secureMessages.openedAt}, ${at.getTime()})`,
          openCount: sql`${schema.secureMessages.openCount} + 1`,
        })
        .where(eq(schema.secureMessages.id, id));
    },
    newCode: async (id: string, hash: string, salt: string) => {
      await db
        .update(schema.secureMessages)
        .set({ codeHash: hash, codeSalt: salt, failedTries: 0 })
        .where(eq(schema.secureMessages.id, id));
    },
    remove: async (id: string) => {
      await rm(pathOf(id), { force: true });
      await db.delete(schema.secureMessages).where(eq(schema.secureMessages.id, id));
    },
    /** Takes out what expired; returns how many. */
    pruneExpired: async (now: Date) => {
      const gone = await db
        .select({ id: schema.secureMessages.id })
        .from(schema.secureMessages)
        .where(lte(schema.secureMessages.expiresAt, now));
      for (const { id } of gone) {
        await rm(pathOf(id), { force: true });
        await db.delete(schema.secureMessages).where(eq(schema.secureMessages.id, id));
      }
      return gone.length;
    },
  };
};

export type SecureStore = ReturnType<typeof createSecureStore>;
