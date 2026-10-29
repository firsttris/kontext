/**
 * Authorities the company trusts for S/MIME, kept by the Firmenverwaltung: root or intermediate
 * certificates (PEM or DER) of an authority Mozilla's list lacks – a Landesverwaltung's, a
 * chamber's, the company's own. They count beside Bun's roots and `SMIME_ROOTS` (trust.ts); the
 * list is read once and again only after a change.
 */
import { X509Certificate } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../company/context";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { nameOf } from "./trust";

export type Authority = {
  fingerprint: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  selfSigned: boolean;
  addedBy: string;
  createdAt: string;
};

export const MAX_AUTHORITIES = 100;

/** A certificate given as PEM or as DER in base64 (a .cer/.crt file read by the browser). */
export const parseAuthority = (text: string): X509Certificate | null => {
  const trimmed = text.trim();
  try {
    return trimmed.includes("-----BEGIN CERTIFICATE-----")
      ? new X509Certificate(trimmed)
      : new X509Certificate(Buffer.from(trimmed.replace(/\s+/g, ""), "base64"));
  } catch {
    return null;
  }
};

/** Why a certificate cannot be an authority here; null when it can. */
export const refusal = (cert: X509Certificate, now: Date): string | null => {
  if (!cert.ca) return "Das ist kein Zertifikat einer Stelle (CA).";
  if (new Date(cert.validTo) < now) return "Das Zertifikat ist abgelaufen.";
  if (new Date(cert.validFrom) > now) return "Das Zertifikat gilt noch nicht.";
  return null;
};

const describeAuthority = (cert: X509Certificate, addedBy: string, createdAt: Date): Authority => ({
  fingerprint: cert.fingerprint256,
  subject: nameOf(cert.subject),
  issuer: nameOf(cert.issuer),
  notBefore: new Date(cert.validFrom).toISOString(),
  notAfter: new Date(cert.validTo).toISOString(),
  selfSigned: cert.checkIssued(cert),
  addedBy,
  createdAt: createdAt.toISOString(),
});

export type AuthorityStore = ReturnType<typeof createAuthorityStore>;

export const createAuthorityStore = (db: Db) => {
  let certs: X509Certificate[] | null = null;
  let version = 0;
  const rows = () =>
    db.select().from(schema.smimeAuthorities).orderBy(desc(schema.smimeAuthorities.createdAt));
  const changed = () => {
    certs = null;
    version++;
  };
  return {
    list: async (): Promise<Authority[]> =>
      (await rows()).flatMap((row) => {
        const cert = parseAuthority(row.certificate);
        return cert ? [describeAuthority(cert, row.addedBy, row.createdAt)] : [];
      }),
    /** The certificates, for the trust check. */
    certs: async (): Promise<X509Certificate[]> => {
      certs ??= (await rows()).flatMap((row) => parseAuthority(row.certificate) ?? []);
      return certs;
    },
    /** Counts the changes: a trust answer from before one no longer holds. */
    version: () => version,
    add: async (cert: X509Certificate, addedBy: string, now = new Date()) => {
      await db
        .insert(schema.smimeAuthorities)
        .values({
          fingerprint: cert.fingerprint256,
          certificate: cert.toString(),
          subject: nameOf(cert.subject),
          notAfter: new Date(cert.validTo),
          addedBy,
          createdAt: now,
        })
        .onConflictDoNothing();
      changed();
      return describeAuthority(cert, addedBy, now);
    },
    remove: async (fingerprint: string) => {
      await db
        .delete(schema.smimeAuthorities)
        .where(eq(schema.smimeAuthorities.fingerprint, fingerprint));
      changed();
    },
  };
};

type Store = Pick<AuthorityStore, "list" | "add" | "remove">;

/** The Firmenverwaltung's list, behind its check (company/routes.ts). */
export const authorityRoutes = (store: Store, now: () => Date = () => new Date()) => {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ authorities: await store.list() }));
  app.post("/", async (c) => {
    const parsed = z
      .object({ certificate: z.string().min(100).max(50_000) })
      .safeParse(await c.req.json().catch(() => null));
    const cert = parsed.success ? parseAuthority(parsed.data.certificate) : null;
    if (!cert) return c.json({ error: "Kein Zertifikat (PEM oder DER)." }, 400);
    const why = refusal(cert, now());
    if (why) return c.json({ error: why }, 400);
    const kept = await store.list();
    if (kept.some((entry) => entry.fingerprint === cert.fingerprint256)) {
      return c.json({ error: "Diese Stelle ist schon eingetragen." }, 409);
    }
    if (kept.length >= MAX_AUTHORITIES) {
      return c.json({ error: `Höchstens ${MAX_AUTHORITIES} Stellen.` }, 400);
    }
    const { company, selfId } = c.get("loaded");
    const self = company.employees.find((employee) => employee.id === selfId);
    const authority = await store.add(cert, self?.email ?? selfId, now());
    return c.json({ authority, authorities: await store.list() }, 201);
  });
  app.delete("/:fingerprint", async (c) => {
    await store.remove(c.req.param("fingerprint"));
    return c.json({ authorities: await store.list() });
  });
  return app;
};
