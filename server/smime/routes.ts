/**
 * /api/smime: one's own S/MIME certificate (its .p12 only as it came, locked with its password)
 * and the certificates of others one knows, from signed mails or a file. Certificates are checked
 * here for the address they claim; whether one trusts the issuer is the person's call.
 */
import { Hono } from "hono";
import { z } from "zod";
import { certInfo } from "../../src/lib/smime";
import type { SessionAccount } from "../categories/routes";
import type { SmimeStore } from "./store";

const SOURCES = ["mail", "import"] as const;
const pem = z.string().min(100).max(50_000);
const email = z.string().trim().toLowerCase().email().max(254);

export type SmimeDeps = {
  store: SmimeStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
};

const infoOf = async (certificate: string) => {
  try {
    return await certInfo(certificate);
  } catch {
    return null;
  }
};

export const createSmimeRoutes = ({ store, accountsOf }: SmimeDeps) => {
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
    for (const address of emails) {
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

  app.post("/certs/remove", async (c) => {
    const parsed = email.safeParse((await c.req.json().catch(() => null))?.email);
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.forget(c.get("me"), parsed.data);
    return c.json({ certs: await store.known(c.get("me")) });
  });

  return app;
};
