/**
 * Abmelden nach Inaktivität: a company_setting (settings.ts) in minutes, 0 while it is off.
 * Everyone signed in reads it, because their app counts the time and signs out
 * (src/lib/idle-logout.ts); only the Firmenverwaltung changes it.
 *
 * The server does not enforce it itself: it cannot tell a person's input from the app's own
 * requests (push, live connection, refreshes), so it would need the browser to report the input
 * anyway – the same trust as the browser signing out on its own (docs/architecture.md).
 */
import { Hono } from "hono";
import { z } from "zod";
import { IDLE_MINUTES } from "../../src/lib/idle-logout";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

const idleSchema = z.object({
  minutes: z
    .number()
    .int()
    .refine((minutes) => (IDLE_MINUTES as readonly number[]).includes(minutes)),
});

/** For everyone signed in; null for a request without a session. */
export const readIdleLogout =
  ({ currentEmail, settings }: Pick<CompanyDeps, "currentEmail" | "settings">) =>
  async (request: Request): Promise<{ minutes: number } | null> =>
    (await currentEmail(request)) ? { minutes: await settings.idleLogout() } : null;

/** The Firmenverwaltung's change; behind its check (routes.ts). 0 switches it off. */
export const idleLogoutRoutes = ({ settings }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, idleSchema);
    if (!body) return bad("Angaben unvollständig.");
    await settings.saveIdleLogout(body.minutes);
    return c.json({ minutes: body.minutes });
  });
  return app;
};
