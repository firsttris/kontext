/** S/MIME certificates in Kontext's SQLite: one's own (in its locked .p12), and others'. */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type OwnCert = {
  email: string;
  fingerprint: string;
  certificate: string;
  p12: string;
  notAfter: string;
};

export type KnownCert = {
  email: string;
  fingerprint: string;
  certificate: string;
  issuer: string;
  notAfter: string;
  source: string;
  previousFingerprint: string | null;
  updatedAt: string;
};

export const createSmimeStore = (db: Db) => ({
  own: async (memberId: string): Promise<OwnCert | null> => {
    const [row] = await db
      .select()
      .from(schema.smimeOwn)
      .where(eq(schema.smimeOwn.memberId, memberId));
    return row
      ? {
          email: row.email,
          fingerprint: row.fingerprint,
          certificate: row.certificate,
          p12: row.p12,
          notAfter: row.notAfter.toISOString(),
        }
      : null;
  },
  setOwn: async (memberId: string, cert: OwnCert) => {
    const now = new Date();
    const values = { ...cert, notAfter: new Date(cert.notAfter) };
    await db
      .insert(schema.smimeOwn)
      .values({ memberId, ...values, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: schema.smimeOwn.memberId, set: { ...values, updatedAt: now } });
  },
  removeOwn: async (memberId: string) => {
    await db.delete(schema.smimeOwn).where(eq(schema.smimeOwn.memberId, memberId));
  },
  known: async (memberId: string): Promise<KnownCert[]> =>
    (await db.select().from(schema.smimeCerts).where(eq(schema.smimeCerts.memberId, memberId))).map(
      (row) => ({
        email: row.email,
        fingerprint: row.fingerprint,
        certificate: row.certificate,
        issuer: row.issuer,
        notAfter: row.notAfter.toISOString(),
        source: row.source,
        previousFingerprint: row.previousFingerprint,
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
  /** Keeps a certificate for an address; another than before is kept with the earlier one named. */
  remember: async (
    memberId: string,
    cert: {
      email: string;
      fingerprint: string;
      certificate: string;
      issuer: string;
      notAfter: string;
      source: string;
    },
  ) => {
    const where = and(
      eq(schema.smimeCerts.memberId, memberId),
      eq(schema.smimeCerts.email, cert.email),
    );
    const [current] = await db.select().from(schema.smimeCerts).where(where);
    const now = new Date();
    const values = { ...cert, notAfter: new Date(cert.notAfter) };
    if (!current) {
      await db
        .insert(schema.smimeCerts)
        .values({ memberId, ...values, createdAt: now, updatedAt: now });
      return;
    }
    if (current.fingerprint === cert.fingerprint) return;
    await db
      .update(schema.smimeCerts)
      .set({ ...values, previousFingerprint: current.fingerprint, updatedAt: now })
      .where(where);
  },
  forget: async (memberId: string, email: string) => {
    await db
      .delete(schema.smimeCerts)
      .where(and(eq(schema.smimeCerts.memberId, memberId), eq(schema.smimeCerts.email, email)));
  },
});

export type SmimeStore = ReturnType<typeof createSmimeStore>;
