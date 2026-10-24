/** Team chat in Kontext's SQLite: channels, their members, messages and read marks. */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import {
  type Channel,
  type ChannelKind,
  type ChannelSummary,
  canSee,
  directKey,
  type Message,
  type Viewer,
} from "./chat";

export type ChatStore = {
  /** The channels this person sees, with what is unread; creates #allgemein and the mailbox ones. */
  list: (viewer: Viewer, sharedAccountIds: string[]) => Promise<ChannelSummary[]>;
  get: (id: string) => Promise<Channel | null>;
  createChannel: (name: string, members: string[], createdBy: string) => Promise<Channel>;
  /** The direct conversation of exactly these people, made when there is none yet. */
  direct: (members: string[], createdBy: string) => Promise<Channel>;
  update: (id: string, patch: { name?: string; members?: string[] }) => Promise<Channel | null>;
  /** The newest messages before `before` (all when null), newest first. */
  messages: (channelId: string, before: Date | null, limit: number) => Promise<Message[]>;
  post: (channelId: string, authorId: string, text: string, mentions: string[]) => Promise<Message>;
  /** Marks read up to `at`; never moves the mark back. Returns the mark. */
  markRead: (channelId: string, memberId: string, at: Date) => Promise<Date>;
  /** Up to when each member read the channel. */
  reads: (channelId: string) => Promise<Record<string, string>>;
};

const TEAM_NAME = "allgemein";
/** A fixed id: there is one #allgemein, even when two people open the chat at the same time. */
const TEAM_ID = "team";

type ChannelRow = typeof schema.chatChannels.$inferSelect;
type MessageRow = typeof schema.chatMessages.$inferSelect;

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

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  channelId: row.channelId,
  authorId: row.authorId,
  text: row.text,
  mentions: JSON.parse(row.mentions) as string[],
  createdAt: row.createdAt.toISOString(),
});

export const createChatStore = (db: Db): ChatStore => {
  // Messages of one channel never share a millisecond, so "before" pages cleanly.
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp);
  };

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

  const lastOf = async (channels: Channel[]) => {
    const last = new Map<string, { authorId: string; text: string }>();
    for (const channel of channels) {
      if (!channel.lastMessageAt) continue;
      const [row] = await db
        .select({ authorId: schema.chatMessages.authorId, text: schema.chatMessages.text })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.channelId, channel.id))
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(1);
      if (row) last.set(channel.id, row);
    }
    return last;
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
        lastOf(visible),
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
    messages: async (channelId, before, limit) => {
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
      return rows.map(toMessage);
    },
    post: async (channelId, authorId, text, mentions) => {
      const row = {
        id: crypto.randomUUID(),
        channelId,
        authorId,
        text,
        mentions: JSON.stringify([...new Set(mentions)]),
        createdAt: stamp(),
      };
      await db.insert(schema.chatMessages).values(row);
      await db
        .update(schema.chatChannels)
        .set({ lastMessageAt: row.createdAt })
        .where(eq(schema.chatChannels.id, channelId));
      return toMessage(row);
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
