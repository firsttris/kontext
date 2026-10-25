/**
 * Agents connected to Kontext: by an access key or by OAuth (server/mcp/oauth.ts). A connection
 * stands for its own sign-in session: the session row holds the connection's Stalwart grant
 * (server/auth.ts), so an agent reaches exactly what its owner may reach in Stalwart and loses it
 * when that session is deleted. What an agent changes is logged with its connection.
 */
import { and, count, desc, eq, gte, inArray, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

/** Recognisable in a config file or a leak report. */
const PREFIX = "kontext_";
/** The session never ends on its own; Stalwart's refresh token decides how long it works. */
const SESSION_YEARS = 10;
/** Log lines shown per connection in the settings. */
const RECENT = 5;

/** "read" is always there; "write" lets an agent create and change (no sending, no deleting). */
export const SCOPES = ["read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

export const parseScopes = (text: string | null | undefined): Scope[] => {
  const given = new Set((text ?? "").split(/\s+/));
  return SCOPES.filter((scope) => scope === "read" || given.has(scope));
};

export type LogLine = { tool: string; summary: string; at: string };

export type ConnectionInfo = {
  id: string;
  name: string;
  kind: "key" | "oauth";
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  recent: LogLine[];
};

export type McpCaller = {
  connectionId: string;
  userId: string;
  sessionId: string;
  email: string;
  scopes: Scope[];
  /** The OAuth client of the connection; null for an access key. */
  clientId: string | null;
};

export const hashKey = async (key: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).toString("hex");

export const newKey = (): string =>
  `${PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;

/** Whether a bearer token is one of our access keys (else it may be an OAuth token). */
export const isAccessKey = (token: string): boolean => token.startsWith(PREFIX);

/** The token from an `Authorization: Bearer …` header. */
export const bearerToken = (header: string | null | undefined): string | null =>
  header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

type Row = typeof schema.mcpKey.$inferSelect;

const toInfo = (row: Row, recent: LogLine[]): ConnectionInfo => ({
  id: row.id,
  name: row.name,
  kind: row.keyHash ? "key" : "oauth",
  scopes: parseScopes(row.scopes),
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  recent,
});

export const createConnections = (db: Db, now: () => Date = () => new Date()) => {
  const insert = async (row: Omit<Row, "id" | "createdAt" | "lastUsedAt">) => {
    const full = { ...row, id: crypto.randomUUID(), createdAt: now(), lastUsedAt: null };
    await db.insert(schema.mcpKey).values(full);
    return toInfo(full, []);
  };

  /** Who is calling, noting that the connection was used. */
  const callerOf = async (where: SQL | undefined): Promise<McpCaller | null> => {
    const [row] = await db
      .select({
        connectionId: schema.mcpKey.id,
        userId: schema.mcpKey.userId,
        sessionId: schema.mcpKey.sessionId,
        scopes: schema.mcpKey.scopes,
        clientId: schema.mcpKey.clientId,
        email: schema.user.email,
      })
      .from(schema.mcpKey)
      .innerJoin(schema.user, eq(schema.user.id, schema.mcpKey.userId))
      .where(where);
    if (!row) return null;
    await db
      .update(schema.mcpKey)
      .set({ lastUsedAt: now() })
      .where(eq(schema.mcpKey.id, row.connectionId));
    return { ...row, scopes: parseScopes(row.scopes) };
  };

  const removeRow = async (row: Row) => {
    await db.delete(schema.session).where(eq(schema.session.id, row.sessionId));
  };

  return {
    /**
     * A session for a new connection; the caller stores the Stalwart grant for it, then creates
     * the connection. The session's token is random and never sent anywhere, so it cannot be used
     * as a cookie.
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

    /** Ends a session that never got its connection (the grant could not be stored). */
    dropSession: async (sessionId: string): Promise<void> => {
      await db.delete(schema.session).where(eq(schema.session.id, sessionId));
    },

    /** An access key for a session from `openSession`; returned in plain text this once. */
    createKey: async (userId: string, sessionId: string, name: string, scopes: Scope[]) => {
      const key = newKey();
      const info = await insert({
        userId,
        sessionId,
        name,
        keyHash: await hashKey(key),
        clientId: null,
        scopes: scopes.join(" "),
      });
      return { key, info };
    },

    /** An OAuth client's connection; one per person and client, a new consent replaces it. */
    createOAuth: async (
      userId: string,
      sessionId: string,
      name: string,
      clientId: string,
      scopes: Scope[],
    ) => {
      const old = await db
        .select()
        .from(schema.mcpKey)
        .where(and(eq(schema.mcpKey.userId, userId), eq(schema.mcpKey.clientId, clientId)));
      for (const row of old) await removeRow(row);
      return insert({ userId, sessionId, name, keyHash: null, clientId, scopes: scopes.join(" ") });
    },

    list: async (userId: string): Promise<ConnectionInfo[]> => {
      const rows = await db
        .select()
        .from(schema.mcpKey)
        .where(eq(schema.mcpKey.userId, userId))
        .orderBy(desc(schema.mcpKey.createdAt));
      if (!rows.length) return [];
      const lines = await db
        .select()
        .from(schema.mcpLog)
        .where(
          inArray(
            schema.mcpLog.connectionId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(desc(schema.mcpLog.createdAt));
      const recent = (id: string) =>
        lines
          .filter((line) => line.connectionId === id)
          .slice(0, RECENT)
          .map((line) => ({
            tool: line.tool,
            summary: line.summary,
            at: line.createdAt.toISOString(),
          }));
      return rows.map((row) => toInfo(row, recent(row.id)));
    },

    /** Ends the connection's session; the connection, its grant and its log go with it. */
    remove: async (userId: string, id: string): Promise<{ clientId: string | null } | null> => {
      const [row] = await db
        .select()
        .from(schema.mcpKey)
        .where(and(eq(schema.mcpKey.id, id), eq(schema.mcpKey.userId, userId)));
      if (!row) return null;
      await removeRow(row);
      return { clientId: row.clientId };
    },

    /** Who an access key belongs to; null for an unknown or revoked key. */
    resolveKey: async (key: string) => callerOf(eq(schema.mcpKey.keyHash, await hashKey(key))),

    /** The connection a person made for an OAuth client; null when there is none (any more). */
    resolveClient: (userId: string, clientId: string) =>
      callerOf(and(eq(schema.mcpKey.userId, userId), eq(schema.mcpKey.clientId, clientId))),

    log: async (connectionId: string, tool: string, summary: string): Promise<void> => {
      await db
        .insert(schema.mcpLog)
        .values({ id: crypto.randomUUID(), connectionId, tool, summary, createdAt: now() });
    },

    /** How many changes a connection made since then; for the limit on writes. */
    writesSince: async (connectionId: string, since: Date): Promise<number> => {
      const [row] = await db
        .select({ n: count() })
        .from(schema.mcpLog)
        .where(
          and(eq(schema.mcpLog.connectionId, connectionId), gte(schema.mcpLog.createdAt, since)),
        );
      return row?.n ?? 0;
    },
  };
};

export type Connections = ReturnType<typeof createConnections>;
