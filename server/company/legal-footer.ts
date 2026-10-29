/**
 * Pflichtangaben under every mail: a company_setting (settings.ts). Everyone signed in reads it,
 * because their composer adds it when sending; only the Firmenverwaltung changes it.
 */
import { Hono } from "hono";
import { z } from "zod";
import { LEGAL_FOOTER_MAX, normalFooter } from "../../src/lib/legal-footer";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

const footerSchema = z.object({ text: z.string().max(LEGAL_FOOTER_MAX) });

/** For everyone signed in; null for a request without a session. */
export const readLegalFooter =
  ({ currentEmail, settings }: Pick<CompanyDeps, "currentEmail" | "settings">) =>
  async (request: Request): Promise<{ text: string } | null> =>
    (await currentEmail(request)) ? { text: await settings.legalFooter() } : null;

/** The Firmenverwaltung's change; behind its check (routes.ts). An empty text switches it off. */
export const legalFooterRoutes = ({ settings }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, footerSchema);
    if (!body) return bad("Angaben unvollständig.");
    const text = normalFooter(body.text);
    await settings.saveLegalFooter(text);
    return c.json({ text });
  });
  return app;
};
