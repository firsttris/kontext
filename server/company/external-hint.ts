/**
 * Hinweis „Extern“: whether Kontext marks mail from outside and asks before sending outside, and
 * which partner domains count as inside. The switch is a company_setting, the partner domains a
 * table of their own (one row each). Everyone signed in reads it with the company's own domains
 * (their mail app needs them); only the Firmenverwaltung changes it.
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isDomain, normalDomain } from "../../src/lib/external-hint";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

export type ExternalHintSettings = { enabled: boolean; partners: string[] };

export type ExternalHintStore = {
  read: () => Promise<ExternalHintSettings>;
  save: (settings: ExternalHintSettings) => Promise<void>;
};

const ENABLED = "externalHint";

export const createExternalHintStore = (db: Db): ExternalHintStore => ({
  read: async () => {
    const [[setting], partners] = await Promise.all([
      db.select().from(schema.companySetting).where(eq(schema.companySetting.key, ENABLED)),
      db.select().from(schema.partnerDomain).orderBy(schema.partnerDomain.domain),
    ]);
    return { enabled: setting?.value === "on", partners: partners.map((row) => row.domain) };
  },
  save: async ({ enabled, partners }) => {
    const now = new Date();
    const setting = { key: ENABLED, value: enabled ? "on" : "off", updatedAt: now };
    // Both at once: a reader never sees the switch of one save with the domains of another.
    db.transaction((tx) => {
      tx.insert(schema.companySetting)
        .values(setting)
        .onConflictDoUpdate({ target: schema.companySetting.key, set: setting })
        .run();
      tx.delete(schema.partnerDomain).run();
      if (partners.length)
        tx.insert(schema.partnerDomain)
          .values(partners.map((domain) => ({ domain, createdAt: now })))
          .run();
    });
  },
});

const settingsSchema = z.object({
  enabled: z.boolean(),
  partners: z.array(z.string().max(253)).max(200),
});

/** For everyone signed in: the switch and the domains that count as inside. */
export const readExternalHint = (deps: CompanyDeps) => async (request: Request) => {
  if (!(await deps.currentEmail(request))) return null;
  const [settings, domains] = await Promise.all([
    deps.externalHint.read(),
    deps.management.listDomains(),
  ]);
  return { ...settings, domains: domains.map((domain) => normalDomain(domain.name)) };
};

/** The Firmenverwaltung's change; behind its check (routes.ts). */
export const externalHintRoutes = ({ externalHint }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, settingsSchema);
    if (!body) return bad("Angaben unvollständig.");
    const partners = [...new Set(body.partners.map(normalDomain))];
    const invalid = partners.filter((domain) => !isDomain(domain));
    if (invalid.length) return bad(`Keine Domain: ${invalid.join(", ")}`);
    const settings = { enabled: body.enabled, partners: partners.sort() };
    await externalHint.save(settings);
    return c.json(settings);
  });
  return app;
};
