/**
 * Chat messages in Kontext's SQLite, with their cards (mails, tasks, contacts) and files; and the
 * way back from a mail: where it was discussed, and where its sender was talked about before.
 */
import { and, count, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { type Card, type Message, messageSummary } from "./chat";
import type { ChatFiles } from "./files";

export type NewPost = {
  channelId: string;
  authorId: string;
  text: string;
  mentions: string[];
  cards: Card[];
  fileIds: string[];
};

/** A message that shares a mail, with how many messages followed it in its channel. */
export type Discussion = {
  channelId: string;
  messageId: string;
  createdAt: string;
  replies: number;
};

export type MessageStore = {
  /** The newest messages before `before` (all when null), newest first. */
  page: (channelId: string, before: Date | null, limit: number) => Promise<Message[]>;
  post: (post: NewPost) => Promise<Message>;
  /** The last message of each channel, in one line. */
  last: (channelIds: string[]) => Promise<Map<string, { authorId: string; text: string }>>;
  /** Where a mail (or another mail of its thread) was shared, the latest first. */
  discussed: (ref: string, threadId: string | null) => Promise<Discussion[]>;
  /** Channels where mails of this sender were shared, the latest first. */
  channelsOfParty: (party: string) => Promise<string[]>;
};

type MessageRow = typeof schema.chatMessages.$inferSelect;
type CardRow = typeof schema.chatCards.$inferSelect;

const toCard = ({ kind, accountId, ref, threadId, party, label, detail }: CardRow): Card => ({
  kind: kind as Card["kind"],
  accountId,
  ref,
  threadId,
  party,
  label,
  detail,
});

export const createMessageStore = (db: Db, files: ChatFiles): MessageStore => {
  // Messages never share a millisecond, so "before" pages cleanly.
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp);
  };

  const cardsOf = async (messageIds: string[]) => {
    const byMessage = new Map<string, Card[]>();
    if (!messageIds.length) return byMessage;
    const rows = await db
      .select()
      .from(schema.chatCards)
      .where(inArray(schema.chatCards.messageId, messageIds))
      .orderBy(schema.chatCards.position);
    for (const row of rows) {
      byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), toCard(row)]);
    }
    return byMessage;
  };

  /** Messages with their cards and files. */
  const complete = async (rows: MessageRow[]): Promise<Message[]> => {
    const ids = rows.map((row) => row.id);
    const [cards, attached] = await Promise.all([cardsOf(ids), files.ofMessages(ids)]);
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      authorId: row.authorId,
      text: row.text,
      mentions: JSON.parse(row.mentions) as string[],
      files: attached.get(row.id) ?? [],
      cards: cards.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
    }));
  };

  return {
    page: async (channelId, before, limit) => {
      const rows = await db
        .select()
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.channelId, channelId),
            before ? lt(schema.chatMessages.createdAt, before) : undefined,
          ),
        )
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(limit);
      return complete(rows);
    },
    post: async ({ channelId, authorId, text, mentions, cards, fileIds }) => {
      const row = {
        id: crypto.randomUUID(),
        channelId,
        authorId,
        text,
        mentions: JSON.stringify([...new Set(mentions)]),
        createdAt: stamp(),
      };
      await db.insert(schema.chatMessages).values(row);
      if (cards.length) {
        await db.insert(schema.chatCards).values(
          cards.map((card, position) => ({
            ...card,
            messageId: row.id,
            channelId,
            position,
          })),
        );
      }
      await files.attach(fileIds, { id: row.id, channelId, authorId });
      await db
        .update(schema.chatChannels)
        .set({ lastMessageAt: row.createdAt })
        .where(eq(schema.chatChannels.id, channelId));
      return (await complete([row]))[0]!;
    },
    last: async (channelIds) => {
      const last = new Map<string, { authorId: string; text: string }>();
      for (const channelId of channelIds) {
        const [row] = await db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.channelId, channelId))
          .orderBy(desc(schema.chatMessages.createdAt))
          .limit(1);
        if (!row) continue;
        const [message] = await complete([row]);
        last.set(channelId, { authorId: row.authorId, text: messageSummary(message!) });
      }
      return last;
    },
    discussed: async (ref, threadId) => {
      const shared = await db
        .select({
          channelId: schema.chatCards.channelId,
          messageId: schema.chatCards.messageId,
          createdAt: schema.chatMessages.createdAt,
        })
        .from(schema.chatCards)
        .innerJoin(schema.chatMessages, eq(schema.chatMessages.id, schema.chatCards.messageId))
        .where(
          and(
            eq(schema.chatCards.kind, "mail"),
            threadId
              ? or(eq(schema.chatCards.ref, ref), eq(schema.chatCards.threadId, threadId))
              : eq(schema.chatCards.ref, ref),
          ),
        )
        .orderBy(desc(schema.chatMessages.createdAt));
      return Promise.all(
        shared.map(async (row) => {
          const [after] = await db
            .select({ replies: count() })
            .from(schema.chatMessages)
            .where(
              and(
                eq(schema.chatMessages.channelId, row.channelId),
                gt(schema.chatMessages.createdAt, row.createdAt),
              ),
            );
          return { ...row, createdAt: row.createdAt.toISOString(), replies: after?.replies ?? 0 };
        }),
      );
    },
    channelsOfParty: async (party) => {
      if (!party) return [];
      const rows = await db
        .select({
          channelId: schema.chatCards.channelId,
          latest: sql<number>`max(${schema.chatMessages.createdAt})`,
        })
        .from(schema.chatCards)
        .innerJoin(schema.chatMessages, eq(schema.chatMessages.id, schema.chatCards.messageId))
        .where(eq(sql`lower(${schema.chatCards.party})`, party.toLowerCase()))
        .groupBy(schema.chatCards.channelId)
        .orderBy(desc(sql`max(${schema.chatMessages.createdAt})`));
      return rows.map((row) => row.channelId);
    },
  };
};
