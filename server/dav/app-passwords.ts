/**
 * App passwords for CalDAV: with two-step sign-in, Thunderbird and phone apps cannot enter a code,
 * so the person makes a password per app under Einstellungen → Aufgaben in anderen Apps. Like an
 * agent's access key (server/mcp/connections.ts), each one stands for its own sign-in session,
 * whose Stalwart grant (server/auth.ts) reaches what its owner may reach; revoking it deletes
 * that session. It works only for /dav (server/dav/auth.ts): the web sign-in goes to Stalwart,
 * which knows nothing of it. Only its SHA-256 is kept – the password is random (about 100 bits),
 * so a slow hash would add nothing.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

/** No look-alikes (0/o, 1/l/i), lower case: easy to type on a phone. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 5;
const GROUP_LENGTH = 4;
/** The session never ends on its own; Stalwart's refresh token decides how long it works. */
const SESSION_YEARS = 10;
/** "Zuletzt benutzt" is written at most this often, not on every request of a sync. */
const USED_EVERY_MS = 60_000;

export type AppPasswordInfo = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Who an app password belongs to: their address and the session holding the Stalwart grant. */
export type AppPasswordOwner = { id: string; email: string; sessionId: string };

/** "abcd-efgh-jkmn-pqrs-tuvw": five groups of four, 31^20 ≈ 2^99 possibilities. */
export const newAppPassword = (
  random: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string => {
  const chars: string[] = [];
  // Rejection sampling: only bytes below a multiple of the alphabet count, so no letter is likelier.
  const limit = 256 - (256 % ALPHABET.length);
  while (chars.length < GROUPS * GROUP_LENGTH) {
    for (const byte of random(GROUPS * GROUP_LENGTH)) {
      if (byte < limit && chars.length < GROUPS * GROUP_LENGTH) {
        chars.push(ALPHABET[byte % ALPHABET.length]!);
      }
    }
  }
  return Array.from({ length: GROUPS }, (_, group) =>
    chars.slice(group * GROUP_LENGTH, (group + 1) * GROUP_LENGTH).join(""),
  ).join("-");
};

/** Whether a password has the form of an app password (else it goes to Stalwart as it is). */
export const looksLikeAppPassword = (password: string): boolean =>
  new RegExp(
    `^[${ALPHABET}]{${GROUP_LENGTH}}(-[${ALPHABET}]{${GROUP_LENGTH}}){${GROUPS - 1}}$`,
  ).test(password);

export const hashAppPassword = async (password: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password))).toString(
    "hex",
  );

type Row = typeof schema.appPassword.$inferSelect;

const toInfo = (row: Row): AppPasswordInfo => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

export const createAppPasswords = (db: Db, now: () => Date = () => new Date()) => ({
  /**
   * A session for a new app password; the caller stores the Stalwart grant for it, then creates
   * the password. The session's token is random and never sent anywhere: no cookie can use it.
   */
  openSession: async (userId: string, name: string): Promise<string> => {
    const id = crypto.randomUUID();
    const at = now();
    const expiresAt = new Date(at);
    expiresAt.setFullYear(expiresAt.getFullYear() + SESSION_YEARS);
    await db.insert(schema.session).values({
      id,
      userId,
      token: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
      expiresAt,
      userAgent: `Kontext CalDAV: ${name}`,
      createdAt: at,
      updatedAt: at,
    });
    return id;
  },

  /** Ends a session that never got its password (the grant could not be stored). */
  dropSession: async (sessionId: string): Promise<void> => {
    await db.delete(schema.session).where(eq(schema.session.id, sessionId));
  },

  /** An app password for a session from `openSession`; returned in plain text this once. */
  create: async (userId: string, sessionId: string, name: string) => {
    const password = newAppPassword();
    const row = {
      id: crypto.randomUUID(),
      userId,
      sessionId,
      name,
      passwordHash: await hashAppPassword(password),
      createdAt: now(),
      lastUsedAt: null,
    };
    await db.insert(schema.appPassword).values(row);
    return { password, info: toInfo(row) };
  },

  list: async (userId: string): Promise<AppPasswordInfo[]> =>
    (
      await db
        .select()
        .from(schema.appPassword)
        .where(eq(schema.appPassword.userId, userId))
        .orderBy(desc(schema.appPassword.createdAt))
    ).map(toInfo),

  /** Revokes it: its session goes, and with it the grant and the row. */
  remove: async (userId: string, id: string): Promise<boolean> => {
    const [row] = await db
      .select()
      .from(schema.appPassword)
      .where(and(eq(schema.appPassword.id, id), eq(schema.appPassword.userId, userId)));
    if (!row) return false;
    await db.delete(schema.session).where(eq(schema.session.id, row.sessionId));
    return true;
  },

  /** The owner of `password` if it is their app password, noting the use; else null. */
  resolve: async (email: string, password: string): Promise<AppPasswordOwner | null> => {
    if (!looksLikeAppPassword(password)) return null;
    const [row] = await db
      .select({
        id: schema.appPassword.id,
        sessionId: schema.appPassword.sessionId,
        lastUsedAt: schema.appPassword.lastUsedAt,
        email: schema.user.email,
      })
      .from(schema.appPassword)
      .innerJoin(schema.user, eq(schema.user.id, schema.appPassword.userId))
      .where(eq(schema.appPassword.passwordHash, await hashAppPassword(password)));
    if (!row || row.email.toLowerCase() !== email.trim().toLowerCase()) return null;
    const at = now();
    if (!row.lastUsedAt || at.getTime() - row.lastUsedAt.getTime() > USED_EVERY_MS) {
      await db
        .update(schema.appPassword)
        .set({ lastUsedAt: at })
        .where(eq(schema.appPassword.id, row.id));
    }
    return { id: row.id, email: row.email, sessionId: row.sessionId };
  },
});

export type AppPasswords = ReturnType<typeof createAppPasswords>;
