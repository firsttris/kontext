/**
 * What hangs on chat messages besides their cards and files: reactions, the answers in their
 * thread, the folded text for the search; and taking out what is older than the company keeps.
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, lt, max, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { type Card, fold, type Reaction, type Replies } from "./chat";
import type { ChatFiles } from "./files";

/** The text the search looks through: the message and the titles of its cards. */
export const foldedOf = (text: string, cards: Pick<Card, "label">[]): string =>
  fold([text, ...cards.map((card) => card.label)].filter(Boolean).join("\n"));

export const reactionsOf = async (db: Db, ids: string[]) => {
  const byMessage = new Map<string, Reaction[]>();
  if (!ids.length) return byMessage;
  const rows = await db
    .select()
    .from(schema.chatReactions)
    .where(inArray(schema.chatReactions.messageId, ids))
    .orderBy(asc(schema.chatReactions.createdAt));
  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];
    const same = list.find((reaction) => reaction.emoji === row.emoji);
    if (same) same.members.push(row.memberId);
    else list.push({ emoji: row.emoji, members: [row.memberId] });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
};

export const setReaction = async (
  db: Db,
  messageId: string,
  memberId: string,
  emoji: string,
  on: boolean,
) => {
  if (on) {
    await db
      .insert(schema.chatReactions)
      .values({ messageId, memberId, emoji, createdAt: new Date() })
      .onConflictDoNothing();
    return;
  }
  await db
    .delete(schema.chatReactions)
    .where(
      and(
        eq(schema.chatReactions.messageId, messageId),
        eq(schema.chatReactions.memberId, memberId),
        eq(schema.chatReactions.emoji, emoji),
      ),
    );
};

/** How many answers each message has, when the last came, and who wrote them. */
export const repliesOf = async (db: Db, ids: string[]) => {
  const byMessage = new Map<string, Replies>();
  if (!ids.length) return byMessage;
  const answered = and(
    inArray(schema.chatMessages.parentId, ids),
    isNull(schema.chatMessages.deletedAt),
  );
  const totals = await db
    .select({
      parentId: schema.chatMessages.parentId,
      count: count(),
      lastAt: max(schema.chatMessages.createdAt),
    })
    .from(schema.chatMessages)
    .where(answered)
    .groupBy(schema.chatMessages.parentId);
  if (!totals.length) return byMessage;
  const authors = await db
    .selectDistinct({
      parentId: schema.chatMessages.parentId,
      authorId: schema.chatMessages.authorId,
    })
    .from(schema.chatMessages)
    .where(answered);
  for (const total of totals) {
    byMessage.set(total.parentId!, {
      count: total.count,
      lastAt: new Date(total.lastAt ?? 0).toISOString(),
      people: authors.filter((a) => a.parentId === total.parentId).map((a) => a.authorId),
    });
  }
  return byMessage;
};

/** Who wrote in a thread: its first message and every answer. */
export const threadPeople = async (db: Db, parentId: string): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ authorId: schema.chatMessages.authorId })
    .from(schema.chatMessages)
    .where(or(eq(schema.chatMessages.id, parentId), eq(schema.chatMessages.parentId, parentId)));
  return rows.map((row) => row.authorId);
};

/** Fills in the search text of messages from before it was kept (once, at start). */
export const backfillFolded = async (db: Db): Promise<number> => {
  let done = 0;
  for (;;) {
    const rows = await db
      .select({ id: schema.chatMessages.id, text: schema.chatMessages.text })
      .from(schema.chatMessages)
      .where(isNull(schema.chatMessages.folded))
      .limit(500);
    if (!rows.length) return done;
    const cards = await db
      .select({ messageId: schema.chatCards.messageId, label: schema.chatCards.label })
      .from(schema.chatCards)
      .where(
        inArray(
          schema.chatCards.messageId,
          rows.map((row) => row.id),
        ),
      );
    for (const row of rows) {
      const own = cards.filter((card) => card.messageId === row.id);
      await db
        .update(schema.chatMessages)
        .set({ folded: foldedOf(row.text, own) })
        .where(eq(schema.chatMessages.id, row.id));
    }
    done += rows.length;
  }
};

/**
 * Takes out messages from before `cutoff`, with their files: answers by their own age, a message
 * with answers only once its last answer is that old too (a thread goes as a whole).
 */
export const pruneBefore = async (db: Db, files: ChatFiles, cutoff: Date): Promise<number> => {
  const answers = db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(and(isNotNull(schema.chatMessages.parentId), lt(schema.chatMessages.createdAt, cutoff)));
  const fresh = db
    .select({ parentId: schema.chatMessages.parentId })
    .from(schema.chatMessages)
    .where(
      and(
        isNotNull(schema.chatMessages.parentId),
        sql`${schema.chatMessages.createdAt} >= ${cutoff.getTime()}`,
      ),
    );
  const firsts = db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(
      and(
        isNull(schema.chatMessages.parentId),
        lt(schema.chatMessages.createdAt, cutoff),
        sql`${schema.chatMessages.id} not in ${fresh}`,
      ),
    );
  const ids = [...(await answers).map((row) => row.id), ...(await firsts).map((row) => row.id)];
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    await files.removeOfMessages(chunk);
    await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.id, chunk));
  }
  return ids.length;
};
