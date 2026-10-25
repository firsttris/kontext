/**
 * Access keys for agents (MCP). A key stands for its own sign-in session: the session row holds
 * the key's Stalwart grant (server/auth.ts), so a key reaches exactly what its owner may reach in
 * Stalwart and is taken away by deleting that session. Only the key's SHA-256 is stored; the key
 * itself is shown once.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

/** Recognisable in a config file or a leak report. */
const PREFIX = "kontext_";
/** The session never ends on its own; Stalwart's refresh token decides how long the key works. */
const SESSION_YEARS = 10;

export type McpKeyInfo = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type McpCaller = { keyId: string; userId: string; sessionId: string; email: string };

export const hashKey = async (key: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).toString("hex");

export const newKey = (): string =>
  `${PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;

/** The key from an `Authorization: Bearer …` header, if it looks like one of ours. */
export const keyFromHeader = (header: string | null | undefined): string | null => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1]?.startsWith(PREFIX) ? match[1] : null;
};

const toInfo = (row: typeof schema.mcpKey.$inferSelect): McpKeyInfo => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

export const createMcpKeys = (db: Db, now: () => Date = () => new Date()) => ({
  /**
   * A session for a new key; the caller stores the Stalwart grant for it and then calls `create`.
   * The session's token is random and never sent anywhere, so it cannot be used as a cookie.
   */
  openSession: async (userId: string, name: string): Promise<string> => {
    const id = crypto.randomUUID();
    const at = now();
    const expiresAt = new Date(at);
    expiresAt.setFullYear(expiresAt.getFullYear() + SESSION_YEARS);
    await db.insert(schema.session).values({
      id,
      userId,
      token: newKey(),
      expiresAt,
      userAgent: `Kontext MCP: ${name}`,
      createdAt: at,
      updatedAt: at,
    });
    return id;
  },

  /** The key for a session from `openSession`; returned in plain text this once. */
  create: async (userId: string, sessionId: string, name: string) => {
    const key = newKey();
    const row = {
      id: crypto.randomUUID(),
      userId,
      sessionId,
      name,
      keyHash: await hashKey(key),
      createdAt: now(),
    };
    await db.insert(schema.mcpKey).values(row);
    return { key, info: toInfo({ ...row, lastUsedAt: null }) };
  },

  list: async (userId: string): Promise<McpKeyInfo[]> =>
    (
      await db
        .select()
        .from(schema.mcpKey)
        .where(eq(schema.mcpKey.userId, userId))
        .orderBy(desc(schema.mcpKey.createdAt))
    ).map(toInfo),

  /** Ends the key's session; the key and its Stalwart grant go with it (cascade). */
  remove: async (userId: string, id: string): Promise<boolean> => {
    const [row] = await db
      .select()
      .from(schema.mcpKey)
      .where(and(eq(schema.mcpKey.id, id), eq(schema.mcpKey.userId, userId)));
    if (!row) return false;
    await db.delete(schema.session).where(eq(schema.session.id, row.sessionId));
    return true;
  },

  /** Ends a session that never got its key (the grant could not be stored). */
  dropSession: async (sessionId: string): Promise<void> => {
    await db.delete(schema.session).where(eq(schema.session.id, sessionId));
  },

  /** Who a key belongs to, noting that it was used; null for an unknown or revoked key. */
  resolve: async (key: string): Promise<McpCaller | null> => {
    const [row] = await db
      .select({
        keyId: schema.mcpKey.id,
        userId: schema.mcpKey.userId,
        sessionId: schema.mcpKey.sessionId,
        email: schema.user.email,
      })
      .from(schema.mcpKey)
      .innerJoin(schema.user, eq(schema.user.id, schema.mcpKey.userId))
      .where(eq(schema.mcpKey.keyHash, await hashKey(key)));
    if (!row) return null;
    await db
      .update(schema.mcpKey)
      .set({ lastUsedAt: now() })
      .where(eq(schema.mcpKey.id, row.keyId));
    return row;
  },
});

export type McpKeys = ReturnType<typeof createMcpKeys>;
