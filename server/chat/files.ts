/**
 * Photos and files of the chat: the bytes in a directory next to the database (so the backup of
 * the data directory has them), the rest in `chat_files`. A file is uploaded first and belongs to
 * a message once that is sent; uploads never sent are removed after a day.
 */
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { ChatFile } from "./chat";

export type StoredFile = ChatFile & { channelId: string; messageId: string | null; path: string };

export type ChatFiles = {
  save: (channelId: string, uploadedBy: string, file: File) => Promise<ChatFile>;
  get: (id: string) => Promise<StoredFile | null>;
  /** Gives the uploads to the message: only unsent ones of this channel by this person. */
  attach: (
    ids: string[],
    message: { id: string; channelId: string; authorId: string },
  ) => Promise<ChatFile[]>;
  ofMessages: (messageIds: string[]) => Promise<Map<string, ChatFile[]>>;
  /** Removes uploads that were never sent, from before `before`. */
  pruneUnsent: (before: Date) => Promise<number>;
  /** Removes the files of a deleted message, or of a whole channel. */
  removeOfMessage: (messageId: string) => Promise<void>;
  removeOfChannel: (channelId: string) => Promise<void>;
};

type Row = typeof schema.chatFiles.$inferSelect;
const toFile = ({ id, name, type, size }: Row): ChatFile => ({ id, name, type, size });

export const createChatFiles = (db: Db, dir: string): ChatFiles => {
  mkdirSync(dir, { recursive: true });
  // Ids are UUIDs made here, never names from the upload: no path tricks.
  const pathOf = (id: string) => join(dir, id);

  /** Deletes the bytes and rows of the files `where` picks. */
  const removeWhere = async (where: SQL | undefined) => {
    const rows = await db.select({ id: schema.chatFiles.id }).from(schema.chatFiles).where(where);
    for (const { id } of rows) await rm(pathOf(id), { force: true });
    await db.delete(schema.chatFiles).where(where);
    return rows.length;
  };

  return {
    save: async (channelId, uploadedBy, file) => {
      const id = crypto.randomUUID();
      await Bun.write(pathOf(id), file);
      const row = {
        id,
        channelId,
        messageId: null,
        uploadedBy,
        name: file.name.slice(0, 200) || "Datei",
        type: (file.type || "application/octet-stream").slice(0, 100),
        size: file.size,
        createdAt: new Date(),
      };
      await db.insert(schema.chatFiles).values(row);
      return toFile(row);
    },
    get: async (id) => {
      const [row] = await db.select().from(schema.chatFiles).where(eq(schema.chatFiles.id, id));
      return row
        ? { ...toFile(row), channelId: row.channelId, messageId: row.messageId, path: pathOf(id) }
        : null;
    },
    attach: async (ids, message) => {
      if (!ids.length) return [];
      const mine = and(
        inArray(schema.chatFiles.id, ids),
        eq(schema.chatFiles.channelId, message.channelId),
        eq(schema.chatFiles.uploadedBy, message.authorId),
        isNull(schema.chatFiles.messageId),
      );
      await db.update(schema.chatFiles).set({ messageId: message.id }).where(mine);
      const rows = await db
        .select()
        .from(schema.chatFiles)
        .where(eq(schema.chatFiles.messageId, message.id));
      // In the order they were picked.
      return ids.flatMap((id) => rows.filter((row) => row.id === id).map(toFile));
    },
    ofMessages: async (messageIds) => {
      const byMessage = new Map<string, ChatFile[]>();
      if (!messageIds.length) return byMessage;
      const rows = await db
        .select()
        .from(schema.chatFiles)
        .where(inArray(schema.chatFiles.messageId, messageIds))
        .orderBy(schema.chatFiles.createdAt);
      for (const row of rows) {
        const key = row.messageId!;
        byMessage.set(key, [...(byMessage.get(key) ?? []), toFile(row)]);
      }
      return byMessage;
    },
    pruneUnsent: (before) =>
      removeWhere(and(isNull(schema.chatFiles.messageId), lt(schema.chatFiles.createdAt, before))),
    removeOfMessage: async (messageId) => {
      await removeWhere(eq(schema.chatFiles.messageId, messageId));
    },
    removeOfChannel: async (channelId) => {
      await removeWhere(eq(schema.chatFiles.channelId, channelId));
    },
  };
};
