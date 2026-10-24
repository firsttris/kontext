/** Team chat in Kontext's SQLite: channels, their members and read marks (messages: messages.ts). */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import {
  type Channel,
  type ChannelKind,
  type ChannelSummary,
  canSee,
  directKey,
  type Viewer,
} from "./chat";
import type { MessageStore } from "./messages";

export type ChatStore = {
  /** The channels this person sees, with what is unread; creates #allgemein and the mailbox ones. */
  list: (viewer: Viewer, sharedAccountIds: string[]) => Promise<ChannelSummary[]>;
  get: (id: string) => Promise<Channel | null>;
  createChannel: (name: string, members: string[], createdBy: string) => Promise<Channel>;
  /** The direct conversation of exactly these people, made when there is none yet. */
  direct: (members: string[], createdBy: string) => Promise<Channel>;
  update: (id: string, patch: { name?: string; members?: string[] }) => Promise<Channel | null>;
  /** Marks read up to `at`; never moves the mark back. Returns the mark. */
  markRead: (channelId: string, memberId: string, at: Date) => Promise<Date>;
  /** Up to when each member read the channel. */
  reads: (channelId: string) => Promise<Record<string, string>>;
};

const TEAM_NAME = "allgemein";
/** A fixed id: there is one #allgemein, even when two people open the chat at the same time. */
const TEAM_ID = "team";

type ChannelRow = typeof schema.chatChannels.$inferSelect;

const toChannel = (row: ChannelRow, members: string[]): Channel => ({
  id: row.id,
  kind: row.kind as ChannelKind,
  name: row.name,
  accountId: row.accountId,
  members,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
});

export const createChatStore = (db: Db, messages: Pick<MessageStore, "last">): ChatStore => {
  const membersOf = async (ids: string[]) => {
    const byChannel = new Map<string, string[]>();
    if (!ids.length) return byChannel;
    const rows = await db
      .select()
      .from(schema.chatMembers)
      .where(inArray(schema.chatMembers.channelId, ids));
    for (const row of rows) {
      byChannel.set(row.channelId, [...(byChannel.get(row.channelId) ?? []), row.memberId]);
    }
    return byChannel;
  };

  const get = async (id: string) => {
    const [row] = await db.select().from(schema.chatChannels).where(eq(schema.chatChannels.id, id));
    return row ? toChannel(row, (await membersOf([id])).get(id) ?? []) : null;
  };

  const insertChannel = async (
    values: Pick<ChannelRow, "kind" | "name" | "accountId" | "directKey" | "createdBy">,
    members: string[],
    id: string = crypto.randomUUID(),
  ) => {
    const now = new Date();
    const inserted = await db
      .insert(schema.chatChannels)
      .values({ id, ...values, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: schema.chatChannels.id });
    if (inserted.length && members.length) {
      await db
        .insert(schema.chatMembers)
        .values(members.map((memberId) => ({ channelId: id, memberId })));
    }
    return inserted.length ? id : null;
  };

  /** #allgemein and one channel per shared mailbox exist from the first look on. */
  const ensureStandard = async (sharedAccountIds: string[], by: string) => {
    await insertChannel(
      { kind: "team", name: TEAM_NAME, accountId: null, directKey: null, createdBy: by },
      [],
      TEAM_ID,
    );
    for (const accountId of sharedAccountIds) {
      await insertChannel(
        { kind: "mailbox", name: null, accountId, directKey: null, createdBy: by },
        [],
      );
    }
  };

  const unreadOf = async (channelIds: string[], me: string) => {
    if (!channelIds.length) return new Map<string, { unread: number; mentions: number }>();
    const rows = await db
      .select({
        channelId: schema.chatMessages.channelId,
        unread: sql<number>`count(*)`,
        mentions: sql<number>`sum(case when ${schema.chatMessages.mentions} like ${`%${JSON.stringify(me)}%`} then 1 else 0 end)`,
      })
      .from(schema.chatMessages)
      .leftJoin(
        schema.chatReads,
        and(
          eq(schema.chatReads.channelId, schema.chatMessages.channelId),
          eq(schema.chatReads.memberId, me),
        ),
      )
      .where(
        and(
          inArray(schema.chatMessages.channelId, channelIds),
          sql`${schema.chatMessages.authorId} != ${me}`,
          sql`${schema.chatMessages.createdAt} > coalesce(${schema.chatReads.readAt}, 0)`,
        ),
      )
      .groupBy(schema.chatMessages.channelId);
    return new Map(
      rows.map((row) => [row.channelId, { unread: row.unread, mentions: row.mentions ?? 0 }]),
    );
  };

  return {
    list: async (viewer, sharedAccountIds) => {
      await ensureStandard(sharedAccountIds, viewer.me);
      const rows = await db.select().from(schema.chatChannels);
      const members = await membersOf(rows.map((row) => row.id));
      const visible = rows
        .map((row) => toChannel(row, members.get(row.id) ?? []))
        .filter((channel) => canSee(channel, viewer));
      const ids = visible.map((channel) => channel.id);
      const [unread, last, reads] = await Promise.all([
        unreadOf(ids, viewer.me),
        messages.last(visible.filter((channel) => channel.lastMessageAt).map((c) => c.id)),
        ids.length
          ? db
              .select()
              .from(schema.chatReads)
              .where(
                and(
                  inArray(schema.chatReads.channelId, ids),
                  eq(schema.chatReads.memberId, viewer.me),
                ),
              )
          : Promise.resolve([]),
      ]);
      const readAt = new Map(reads.map((row) => [row.channelId, row.readAt.toISOString()]));
      return visible.map((channel) => ({
        ...channel,
        unread: unread.get(channel.id)?.unread ?? 0,
        mentions: unread.get(channel.id)?.mentions ?? 0,
        readAt: readAt.get(channel.id) ?? null,
        last: last.get(channel.id) ?? null,
      }));
    },
    get,
    createChannel: async (name, members, createdBy) => {
      const id = await insertChannel(
        { kind: "channel", name, accountId: null, directKey: null, createdBy },
        [...new Set([createdBy, ...members])],
      );
      return (await get(id!))!;
    },
    direct: async (members, createdBy) => {
      const everyone = [...new Set([createdBy, ...members])];
      const key = directKey(everyone);
      await insertChannel(
        { kind: "direct", name: null, accountId: null, directKey: key, createdBy },
        everyone,
      );
      const [row] = await db
        .select()
        .from(schema.chatChannels)
        .where(eq(schema.chatChannels.directKey, key));
      return (await get(row!.id))!;
    },
    update: async (id, patch) => {
      const current = await get(id);
      if (!current) return null;
      await db
        .update(schema.chatChannels)
        .set({ ...(patch.name ? { name: patch.name } : {}), updatedAt: new Date() })
        .where(eq(schema.chatChannels.id, id));
      if (patch.members) {
        await db.delete(schema.chatMembers).where(eq(schema.chatMembers.channelId, id));
        const members = [...new Set(patch.members)];
        if (members.length) {
          await db
            .insert(schema.chatMembers)
            .values(members.map((memberId) => ({ channelId: id, memberId })));
        }
      }
      return get(id);
    },
    markRead: async (channelId, memberId, at) => {
      await db
        .insert(schema.chatReads)
        .values({ channelId, memberId, readAt: at })
        .onConflictDoUpdate({
          target: [schema.chatReads.channelId, schema.chatReads.memberId],
          set: { readAt: sql`max(${schema.chatReads.readAt}, excluded.read_at)` },
        });
      const [row] = await db
        .select({ readAt: schema.chatReads.readAt })
        .from(schema.chatReads)
        .where(
          and(eq(schema.chatReads.channelId, channelId), eq(schema.chatReads.memberId, memberId)),
        );
      return row!.readAt;
    },
    reads: async (channelId) => {
      const rows = await db
        .select()
        .from(schema.chatReads)
        .where(eq(schema.chatReads.channelId, channelId));
      return Object.fromEntries(rows.map((row) => [row.memberId, row.readAt.toISOString()]));
    },
  };
};
