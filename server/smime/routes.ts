/**
 * /api/smime: one's own S/MIME certificate (its .p12 only as it came, locked with its password)
 * and the certificates of others one knows, from signed mails or a file. Certificates are checked
 * here for the address they claim; whether one trusts the issuer is the person's call.
 */
import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import tls from "node:tls";
import { Hono } from "hono";
import { z } from "zod";
import { certInfo } from "../../src/lib/smime";
import type { SessionAccount } from "../categories/routes";
import type { Resolve } from "../company/security";
import { mayReplace } from "../kept-keys";
import { isPrivateAddress } from "../unsubscribe/private-address";
import type { SmimeStore } from "./store";
import { certFromSmimea, checkTrust, parseCert, smimeaName, type Trust } from "./trust";

/** dns: published by the recipient's domain (SMIMEA, signed with DNSSEC). */
const SOURCES = ["mail", "import", "dns"] as const;
const pem = z.string().min(100).max(50_000);
const email = z.string().trim().toLowerCase().email().max(254);

export type SmimeDeps = {
  store: SmimeStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  /** The authorities one trusts; those Bun brings unless a test says otherwise. */
  roots?: ReturnType<typeof trustedRoots>;
  /** Posts an OCSP request to an authority; tests give a stand-in. */
  post?: (url: string, body: Uint8Array) => Promise<Uint8Array | null>;
  /** DNS lookups (DNS-over-HTTPS), for SMIMEA. */
  resolve?: Resolve;
  now?: () => Date;
};

/** Bun's roots (Mozilla's list), and more from a PEM file. */
export const trustedRoots = (extraFile?: string) => {
  const extra = extraFile
    ? (readFileSync(extraFile, "utf8").match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      ) ?? [])
    : [];
  return [...tls.rootCertificates, ...extra].flatMap((pem) => parseCert(pem) ?? []);
};

/** OCSP over http or https (its answers are signed), to hosts on the internet only, briefly. */
const ocspPost = async (url: string, body: Uint8Array): Promise<Uint8Array | null> => {
  const target = new URL(url);
  const addresses = (await lookup(target.hostname, { all: true }).catch(() => [])).map(
    (entry) => entry.address,
  );
  if (!/^https?:$/.test(target.protocol) || !addresses.length || addresses.some(isPrivateAddress)) {
    return null;
  }
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/ocsp-request" },
    body: body as Uint8Array<ArrayBuffer>,
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length > 100_000 ? null : bytes;
};

/** How long a check counts (per certificate): authorities answer for hours or days anyway. */
const TRUST_MS = 60 * 60_000;

const infoOf = async (certificate: string) => {
  try {
    return await certInfo(certificate);
  } catch {
    return null;
  }
};

export const createSmimeRoutes = ({
  store,
  accountsOf,
  roots = trustedRoots(),
  post = ocspPost,
  resolve,
  now = () => new Date(),
}: SmimeDeps) => {
  const checked = new Map<string, { at: number; trust: Trust }>();
  const app = new Hono<{ Variables: { me: string; address: string } }>();
  app.use(async (c, next) => {
    const own = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal);
    if (!own) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", own.id);
    c.set("address", (own.name ?? "").toLowerCase());
    await next();
  });

  app.get("/me", async (c) => c.json({ cert: await store.own(c.get("me")) }));

  app.put("/me", async (c) => {
    const parsed = z
      .object({ certificate: pem, p12: z.string().min(100).max(200_000) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const info = await infoOf(parsed.data.certificate);
    if (!info) return c.json({ error: "Kein Zertifikat." }, 400);
    if (!info.emails.includes(c.get("address"))) {
      return c.json({ error: `Das Zertifikat gehört nicht zu ${c.get("address")}.` }, 400);
    }
    await store.setOwn(c.get("me"), {
      email: c.get("address"),
      fingerprint: info.fingerprint,
      certificate: parsed.data.certificate,
      p12: parsed.data.p12,
      notAfter: info.notAfter,
    });
    return c.json({ cert: await store.own(c.get("me")) });
  });

  app.delete("/me", async (c) => {
    await store.removeOwn(c.get("me"));
    return c.json({ ok: true });
  });

  app.get("/certs", async (c) => c.json({ certs: await store.known(c.get("me")) }));

  app.put("/certs", async (c) => {
    const parsed = z
      .object({ certificate: pem, source: z.enum(SOURCES), email: email.optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const info = await infoOf(parsed.data.certificate);
    if (!info?.emails.length) return c.json({ error: "Kein Zertifikat mit Adresse." }, 400);
    if (new Date(info.notAfter) < new Date()) {
      return c.json({ error: "Das Zertifikat ist abgelaufen." }, 400);
    }
    // From a mail: only for the address it came from.
    const emails = parsed.data.email
      ? info.emails.filter((candidate) => candidate === parsed.data.email)
      : info.emails;
    if (!emails.length) return c.json({ error: "Das Zertifikat passt nicht zur Adresse." }, 400);
    const kept = await store.known(c.get("me"));
    const incoming = { fingerprint: info.fingerprint, source: parsed.data.source };
    for (const address of emails) {
      const current = kept.find((cert) => cert.email === address);
      if (!mayReplace(current, incoming, "mail")) continue;
      await store.remember(c.get("me"), {
        email: address,
        fingerprint: info.fingerprint,
        certificate: parsed.data.certificate,
        issuer: info.issuer,
        notAfter: info.notAfter,
        source: parsed.data.source,
      });
    }
    return c.json({ certs: await store.known(c.get("me")) });
  });

  /** Whether a certificate is trusted: the chain to an authority, and not revoked. */
  app.post("/trust", async (c) => {
    const parsed = z
      .object({ certificate: pem, chain: z.array(pem).max(10).default([]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const key = parseCert(parsed.data.certificate)?.fingerprint256;
    if (!key) return c.json({ error: "Kein Zertifikat." }, 400);
    const cached = checked.get(key);
    if (cached && now().getTime() - cached.at < TRUST_MS) return c.json({ trust: cached.trust });
    const trust = await checkTrust(parsed.data, { roots, post, now });
    if (!trust) return c.json({ error: "Kein Zertifikat." }, 400);
    checked.set(key, { at: now().getTime(), trust });
    return c.json({ trust });
  });

  /** Somebody's certificate from DNS (SMIMEA): only from a signed answer, only for them. */
  app.get("/lookup", async (c) => {
    const parsed = email.safeParse(c.req.query("email"));
    if (!parsed.success) return c.json({ error: "Keine gültige Adresse." }, 400);
    if (!resolve) return c.json({ certificate: null });
    const answer = await resolve(smimeaName(parsed.data), "SMIMEA").catch(() => null);
    if (!answer?.secure) return c.json({ certificate: null });
    for (const data of answer.data) {
      const certificate = certFromSmimea(data);
      const info = certificate ? await infoOf(certificate) : null;
      if (certificate && info?.emails.includes(parsed.data)) return c.json({ certificate });
    }
    return c.json({ certificate: null });
  });

  app.post("/certs/remove", async (c) => {
    const parsed = email.safeParse((await c.req.json().catch(() => null))?.email);
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.forget(c.get("me"), parsed.data);
    return c.json({ certs: await store.known(c.get("me")) });
  });

  return app;
};
