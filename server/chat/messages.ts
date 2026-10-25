/**
 * Chat messages in Kontext's SQLite, with their cards (mails, tasks, contacts), files, reactions
 * and answers (message-parts.ts); and the way back from a mail: where it was discussed, and where
 * its sender was talked about before.
 */
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import {
  type CallRecord,
  type Card,
  fold,
  MAIL_COPY_TYPE,
  type Message,
  messageSummary,
} from "./chat";
import type { ChatFiles } from "./files";
import {
  foldedOf,
  pruneBefore,
  reactionsOf,
  repliesOf,
  setReaction,
  threadPeople,
} from "./message-parts";

export type NewPost = {
  channelId: string;
  /** An answer in the thread of this message. */
  parentId?: string | null;
  authorId: string;
  text: string;
  mentions: string[];
  cards: Card[];
  fileIds: string[];
  /** Only from the server: the line for a call that ended. */
  call?: CallRecord;
};

/** A message that shares a mail, with how many messages followed it in its channel. */
export type Discussion = {
  channelId: string;
  messageId: string;
  createdAt: string;
  replies: number;
};

export type MessageStore = {
  /** The newest messages of the channel itself (no answers) before `before`, newest first. */
  page: (channelId: string, before: Date | null, limit: number) => Promise<Message[]>;
  /** The answers in a message's thread, oldest first. */
  replies: (parentId: string) => Promise<Message[]>;
  /** Who wrote in a thread, its first message included. */
  threadPeople: (parentId: string) => Promise<string[]>;
  react: (id: string, memberId: string, emoji: string, on: boolean) => Promise<Message>;
  /** Takes out what is older than the company keeps; returns how many messages went. */
  prune: (cutoff: Date) => Promise<number>;
  post: (post: NewPost) => Promise<Message>;
  /** The last message of each channel, in one line. */
  last: (channelIds: string[]) => Promise<Map<string, { authorId: string; text: string }>>;
  /** Where a mail (or another mail of its thread) was shared, the latest first. */
  discussed: (ref: string, threadId: string | null) => Promise<Discussion[]>;
  /** Channels where mails of this sender were shared, the latest first. */
  channelsOfParty: (party: string) => Promise<string[]>;
  get: (id: string) => Promise<Message | null>;
  edit: (id: string, text: string, mentions: string[]) => Promise<Message>;
  /** Removes text, cards and files; the message keeps its place as "deleted". */
  remove: (id: string) => Promise<Message>;
  /** Messages in these channels whose text or card has the words, the latest first. */
  search: (channelIds: string[], words: string, limit: number) => Promise<Message[]>;
};

/** For LIKE: the words as they are, % and _ not as wildcards. */
const likeWords = (words: string) => `%${words.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type MessageRow = typeof schema.chatMessages.$inferSelect;
type CardRow = typeof schema.chatCards.$inferSelect;

const toCard = ({
  kind,
  accountId,
  ref,
  threadId,
  party,
  label,
  detail,
  copyId,
}: CardRow): Card => ({
  kind: kind as Card["kind"],
  accountId,
  ref,
  threadId,
  party,
  label,
  detail,
  copyId,
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
    const firsts = rows.filter((row) => !row.parentId).map((row) => row.id);
    const [cards, attached, reactions, replies] = await Promise.all([
      cardsOf(ids),
      files.ofMessages(ids),
      reactionsOf(db, ids),
      repliesOf(db, firsts),
    ]);
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      authorId: row.authorId,
      text: row.text,
      mentions: JSON.parse(row.mentions) as string[],
      // A mail's copy belongs to its card, not among the files.
      files: (attached.get(row.id) ?? []).filter((file) => file.type !== MAIL_COPY_TYPE),
      cards: cards.get(row.id) ?? [],
      reactions: reactions.get(row.id) ?? [],
      replies: replies.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      deleted: Boolean(row.deletedAt),
      call: row.call && !row.deletedAt ? (JSON.parse(row.call) as CallRecord) : null,
    }));
  };

  const get = async (id: string) => {
    const [row] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, id));
    return row ? (await complete([row]))[0]! : null;
  };

  return {
    page: async (channelId, before, limit) => {
      const rows = await db
        .select()
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.channelId, channelId),
            isNull(schema.chatMessages.parentId),
            before ? lt(schema.chatMessages.createdAt, before) : undefined,
          ),
        )
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(limit);
      return complete(rows);
    },
    replies: async (parentId) =>
      complete(
        await db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.parentId, parentId))
          .orderBy(asc(schema.chatMessages.createdAt)),
      ),
    threadPeople: (parentId) => threadPeople(db, parentId),
    react: async (id, memberId, emoji, on) => {
      await setReaction(db, id, memberId, emoji, on);
      return (await get(id))!;
    },
    prune: (cutoff) => pruneBefore(db, files, cutoff),
    post: async ({
      channelId,
      parentId = null,
      authorId,
      text,
      mentions,
      cards,
      fileIds,
      call,
    }) => {
      const row = {
        id: crypto.randomUUID(),
        channelId,
        parentId,
        authorId,
        text,
        folded: foldedOf(text, cards),
        mentions: JSON.stringify([...new Set(mentions)]),
        createdAt: stamp(),
        editedAt: null,
        deletedAt: null,
        call: call ? JSON.stringify(call) : null,
      };
      await db.insert(schema.chatMessages).values(row);
      // A copy counts only if it is one's own upload in this channel, given to this message.
      const copies = cards.flatMap((card) => (card.copyId ? [card.copyId] : []));
      const attached = await files.attach([...fileIds, ...copies], {
        id: row.id,
        channelId,
        authorId,
      });
      const kept = new Set(
        attached.filter((file) => file.type === MAIL_COPY_TYPE).map((file) => file.id),
      );
      if (cards.length) {
        await db.insert(schema.chatCards).values(
          cards.map((card, position) => ({
            ...card,
            copyId: card.copyId && kept.has(card.copyId) ? card.copyId : null,
            messageId: row.id,
            channelId,
            position,
          })),
        );
      }
      // An answer leaves the channel's order as it is.
      if (!parentId) {
        await db
          .update(schema.chatChannels)
          .set({ lastMessageAt: row.createdAt })
          .where(eq(schema.chatChannels.id, channelId));
      }
      return (await complete([row]))[0]!;
    },
    last: async (channelIds) => {
      const last = new Map<string, { authorId: string; text: string }>();
      for (const channelId of channelIds) {
        const [row] = await db
          .select()
          .from(schema.chatMessages)
          .where(
            and(eq(schema.chatMessages.channelId, channelId), isNull(schema.chatMessages.parentId)),
          )
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
    get,
    edit: async (id, text, mentions) => {
      const cards = (await cardsOf([id])).get(id) ?? [];
      await db
        .update(schema.chatMessages)
        .set({
          text,
          mentions: JSON.stringify([...new Set(mentions)]),
          folded: foldedOf(text, cards),
          editedAt: new Date(),
        })
        .where(eq(schema.chatMessages.id, id));
      return (await get(id))!;
    },
    remove: async (id) => {
      await db
        .update(schema.chatMessages)
        .set({ text: "", mentions: "[]", folded: "", deletedAt: new Date(), call: null })
        .where(eq(schema.chatMessages.id, id));
      await db.delete(schema.chatCards).where(eq(schema.chatCards.messageId, id));
      await db.delete(schema.chatReactions).where(eq(schema.chatReactions.messageId, id));
      await files.removeOfMessage(id);
      return (await get(id))!;
    },
    search: async (channelIds, words, limit) => {
      if (!channelIds.length) return [];
      // The text was folded when written; the words are folded the same way.
      const pattern = likeWords(fold(words));
      const rows = await db
        .select()
        .from(schema.chatMessages)
        .where(
          and(
            inArray(schema.chatMessages.channelId, channelIds),
            isNull(schema.chatMessages.deletedAt),
            sql`${schema.chatMessages.folded} like ${pattern} escape '\\'`,
          ),
        )
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(limit);
      return complete(rows);
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
