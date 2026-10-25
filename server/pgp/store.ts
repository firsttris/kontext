/** OpenPGP keys in Kontext's SQLite: one's own (locked), and those of others one knows. */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type OwnKey = {
  email: string;
  fingerprint: string;
  publicKey: string;
  privateKey: string;
  recoveryKey: string;
};

export type KnownKey = {
  email: string;
  fingerprint: string;
  publicKey: string;
  source: string;
  previousFingerprint: string | null;
  updatedAt: string;
};

export const createPgpStore = (db: Db) => ({
  own: async (memberId: string): Promise<OwnKey | null> => {
    const [row] = await db.select().from(schema.pgpOwn).where(eq(schema.pgpOwn.memberId, memberId));
    return row
      ? {
          email: row.email,
          fingerprint: row.fingerprint,
          publicKey: row.publicKey,
          privateKey: row.privateKey,
          recoveryKey: row.recoveryKey,
        }
      : null;
  },
  /** Everyone's own public key, for WKD. */
  allOwn: async () =>
    db
      .select({ email: schema.pgpOwn.email, publicKey: schema.pgpOwn.publicKey })
      .from(schema.pgpOwn),
  setOwn: async (memberId: string, key: OwnKey) => {
    const now = new Date();
    await db
      .insert(schema.pgpOwn)
      .values({ memberId, ...key, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: schema.pgpOwn.memberId, set: { ...key, updatedAt: now } });
  },
  removeOwn: async (memberId: string) => {
    await db.delete(schema.pgpOwn).where(eq(schema.pgpOwn.memberId, memberId));
  },
  known: async (memberId: string): Promise<KnownKey[]> =>
    (await db.select().from(schema.pgpKeys).where(eq(schema.pgpKeys.memberId, memberId))).map(
      (row) => ({
        email: row.email,
        fingerprint: row.fingerprint,
        publicKey: row.publicKey,
        source: row.source,
        previousFingerprint: row.previousFingerprint,
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
  /** Keeps a key for an address; another than before is kept with the earlier one named. */
  remember: async (
    memberId: string,
    key: { email: string; fingerprint: string; publicKey: string; source: string },
  ) => {
    const [current] = await db
      .select()
      .from(schema.pgpKeys)
      .where(and(eq(schema.pgpKeys.memberId, memberId), eq(schema.pgpKeys.email, key.email)));
    const now = new Date();
    if (!current) {
      await db.insert(schema.pgpKeys).values({ memberId, ...key, createdAt: now, updatedAt: now });
      return;
    }
    const changed = current.fingerprint !== key.fingerprint;
    await db
      .update(schema.pgpKeys)
      .set({
        publicKey: key.publicKey,
        source: changed ? key.source : current.source,
        fingerprint: key.fingerprint,
        previousFingerprint: changed ? current.fingerprint : current.previousFingerprint,
        updatedAt: changed || current.publicKey !== key.publicKey ? now : current.updatedAt,
      })
      .where(and(eq(schema.pgpKeys.memberId, memberId), eq(schema.pgpKeys.email, key.email)));
  },
  forget: async (memberId: string, email: string) => {
    await db
      .delete(schema.pgpKeys)
      .where(and(eq(schema.pgpKeys.memberId, memberId), eq(schema.pgpKeys.email, email)));
  },
});

export type PgpStore = ReturnType<typeof createPgpStore>;
