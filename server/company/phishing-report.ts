/**
 * Als Phishing melden: the address a suspicious mail is sent to (the company's IT or its IT
 * provider), a company_setting (settings.ts). Everyone signed in reads it, because their mail
 * app sends the report itself (src/jmap/phishing-report.ts); only the Firmenverwaltung changes
 * it. Empty while there is none: then nobody is offered the report.
 */
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

const reportSchema = z.object({
  address: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]),
});

/** For everyone signed in; null for a request without a session. */
export const readPhishingReport =
  ({ currentEmail, settings }: Pick<CompanyDeps, "currentEmail" | "settings">) =>
  async (request: Request): Promise<{ address: string } | null> =>
    (await currentEmail(request)) ? { address: await settings.phishingReport() } : null;

/** The Firmenverwaltung's change; behind its check (routes.ts). An empty address switches it off. */
export const phishingReportRoutes = ({ settings }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, reportSchema);
    if (!body) return bad("Keine gültige E-Mail-Adresse.");
    await settings.savePhishingReport(body.address);
    return c.json({ address: body.address });
  });
  return app;
};
