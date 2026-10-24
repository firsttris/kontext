/** The browsers' push subscriptions, and the VAPID key the server signs its pushes with. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { generateVapidKeys, type PushTarget, type VapidKeys } from "./webpush";

export type PushStore = {
  save: (target: PushTarget, memberId: string, sessionId: string) => Promise<void>;
  remove: (endpoint: string) => Promise<void>;
  /** The subscriptions of these people. */
  targetsOf: (memberIds: string[]) => Promise<(PushTarget & { memberId: string })[]>;
  /** Everyone with a subscription, with the newest session to act for them. */
  subscribers: () => Promise<{ memberId: string; sessionId: string }[]>;
  /** The mailboxes this person wants no mail pushes for. */
  mailboxesOff: (memberId: string) => Promise<string[]>;
  setMailbox: (memberId: string, accountId: string, on: boolean) => Promise<void>;
};

export const createPushStore = (db: Db): PushStore => ({
  save: async ({ endpoint, keys }, memberId, sessionId) => {
    const row = { endpoint, p256dh: keys.p256dh, auth: keys.auth, memberId, sessionId };
    await db
      .insert(schema.pushSubscriptions)
      .values({ ...row, createdAt: new Date() })
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: row });
  },
  remove: async (endpoint) => {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  },
  targetsOf: async (memberIds) => {
    if (!memberIds.length) return [];
    const rows = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(inArray(schema.pushSubscriptions.memberId, memberIds));
    return rows.map(({ endpoint, p256dh, auth, memberId }) => ({
      endpoint,
      keys: { p256dh, auth },
      memberId,
    }));
  },
  subscribers: async () => {
    const rows = await db
      .select({
        memberId: schema.pushSubscriptions.memberId,
        sessionId: schema.pushSubscriptions.sessionId,
      })
      .from(schema.pushSubscriptions)
      .orderBy(desc(schema.pushSubscriptions.createdAt));
    const seen = new Set<string>();
    return rows.filter((row) => !seen.has(row.memberId) && seen.add(row.memberId));
  },
  mailboxesOff: async (memberId) =>
    (
      await db
        .select({ accountId: schema.pushMailboxesOff.accountId })
        .from(schema.pushMailboxesOff)
        .where(eq(schema.pushMailboxesOff.memberId, memberId))
    ).map((row) => row.accountId),
  setMailbox: async (memberId, accountId, on) => {
    if (on) {
      await db
        .delete(schema.pushMailboxesOff)
        .where(
          and(
            eq(schema.pushMailboxesOff.memberId, memberId),
            eq(schema.pushMailboxesOff.accountId, accountId),
          ),
        );
    } else {
      await db
        .insert(schema.pushMailboxesOff)
        .values({ memberId, accountId })
        .onConflictDoNothing();
    }
  },
});

const VAPID_SETTING = "web-push-vapid";

/** The server's VAPID key pair: made once, kept sealed with the server's secret. */
export const loadVapidKeys = async (db: Db, sealer: Sealer): Promise<VapidKeys> => {
  const [row] = await db
    .select()
    .from(schema.companySetting)
    .where(eq(schema.companySetting.key, VAPID_SETTING));
  if (row) return JSON.parse(await sealer.open(row.value)) as VapidKeys;
  const keys = await generateVapidKeys();
  await db
    .insert(schema.companySetting)
    .values({
      key: VAPID_SETTING,
      value: await sealer.seal(JSON.stringify(keys)),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  // Two starts at once: the one stored first wins.
  return loadVapidKeys(db, sealer);
};
