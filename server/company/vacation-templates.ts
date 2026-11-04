/**
 * Vorlagen for the out-of-office reply: a company_setting (settings.ts), the whole list at once.
 * Everyone signed in reads them, because they pick one for their own reply; only the
 * Firmenverwaltung changes them. Filled in the app (src/lib/vacation-template.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  VACATION_TEMPLATES_MAX,
  VACATION_TEXT_MAX,
  VACATION_TITLE_MAX,
  type VacationTemplate,
} from "../../src/lib/vacation-template";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

const templatesSchema = z.object({
  templates: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(VACATION_TITLE_MAX),
        text: z.string().trim().min(1).max(VACATION_TEXT_MAX),
      }),
    )
    .max(VACATION_TEMPLATES_MAX),
});

/** For everyone signed in; null for a request without a session. */
export const readVacationTemplates =
  ({ currentEmail, settings }: Pick<CompanyDeps, "currentEmail" | "settings">) =>
  async (request: Request): Promise<{ templates: VacationTemplate[] } | null> =>
    (await currentEmail(request)) ? { templates: await settings.vacationTemplates() } : null;

/** The Firmenverwaltung's change; behind its check (routes.ts). An empty list removes them. */
export const vacationTemplateRoutes = ({ settings }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, templatesSchema);
    if (!body) return bad("Jede Vorlage braucht einen Titel und einen Text.");
    await settings.saveVacationTemplates(body.templates);
    return c.json({ templates: body.templates });
  });
  return app;
};
