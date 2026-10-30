/**
 * The person's sign-in sessions from the database: listed for the Zugänge, and ended one by one.
 * Ending one also ends its grant at Stalwart (Grants.end), then the session; with it go its push
 * subscriptions (server/db/schema.ts, on delete cascade).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Grants } from "../auth";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { SessionRow } from "./devices";

export const createSessionStore = (db: Db, grants: Pick<Grants, "end">) => ({
  /** Every session of the person, and which of them app passwords and agents hold. */
  list: async (userId: string): Promise<{ rows: SessionRow[]; heldIds: Set<string> }> => {
    const [rows, apps, agents] = await Promise.all([
      db
        .select({
          id: schema.session.id,
          userAgent: schema.session.userAgent,
          ipAddress: schema.session.ipAddress,
          createdAt: schema.session.createdAt,
          updatedAt: schema.session.updatedAt,
          grantUpdatedAt: schema.stalwartGrant.updatedAt,
        })
        .from(schema.session)
        .leftJoin(schema.stalwartGrant, eq(schema.stalwartGrant.sessionId, schema.session.id))
        .where(eq(schema.session.userId, userId)),
      db
        .select({ id: schema.appPassword.sessionId })
        .from(schema.appPassword)
        .where(eq(schema.appPassword.userId, userId)),
      db
        .select({ id: schema.mcpKey.sessionId })
        .from(schema.mcpKey)
        .where(eq(schema.mcpKey.userId, userId)),
    ]);
    return { rows, heldIds: new Set([...apps, ...agents].map((held) => held.id)) };
  },

  /** Ends the person's sessions `ids`; ids of others are left alone. */
  end: async (userId: string, ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const own = await db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(and(eq(schema.session.userId, userId), inArray(schema.session.id, ids)));
    for (const { id } of own) await grants.end(id);
    if (own.length) {
      await db.delete(schema.session).where(
        inArray(
          schema.session.id,
          own.map((row) => row.id),
        ),
      );
    }
  },
});

export type SessionStore = ReturnType<typeof createSessionStore>;
