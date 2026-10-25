/**
 * The Firmenverwaltung under /api/company: people and shared mailboxes of the company. Only users
 * with the company role may use it; the server works with its own Stalwart key and allows only
 * what is here (no roles beyond the mark, no other accounts, no server settings).
 */
import { Hono } from "hono";
import { retentionSchema } from "../chat/chat";
import { migrationRoutes } from "../migration/routes";
import { syncRoutes } from "../migration/sync-routes";
import { bad, bodyOf, type CompanyDeps, createLoader, type Env } from "./context";
import { employeeRoutes } from "./employees";
import { mailboxRoutes } from "./mailboxes";
import { signatureRoutes } from "./signature-routes";

export type { CompanyDeps };

export const createCompanyRoutes = (deps: CompanyDeps) => {
  const load = createLoader(deps);
  const app = new Hono<Env>();

  /** Whether to show the Firmenverwaltung at all; asked by every signed-in user. */
  app.get("/me", async (c) =>
    c.json({ admin: Boolean(await load(c.req.raw, { folders: false })) }),
  );

  app.use("*", async (c, next) => {
    const loaded = await load(c.req.raw);
    if (!loaded) return c.json({ error: "Keine Berechtigung" }, 403);
    c.set("loaded", loaded);
    await next();
  });

  app.get("/", (c) => {
    const { company, selfId } = c.get("loaded");
    return c.json({ ...company, selfId });
  });
  app.route("/employees", employeeRoutes(deps));
  app.route("/mailboxes", mailboxRoutes(deps));
  app.route("/signature", signatureRoutes(deps));
  app.get("/chat-retention", async (c) =>
    c.json({ days: (await deps.chatRetention?.days()) ?? 0 }),
  );
  app.put("/chat-retention", async (c) => {
    const body = await bodyOf(c, retentionSchema);
    if (!body || !deps.chatRetention) return bad("Angaben unvollständig.");
    await deps.chatRetention.setDays(body.days);
    return c.json({ days: body.days, removed: (await deps.pruneChat?.()) ?? 0 });
  });
  app.route("/migrations", migrationRoutes(deps.migrations));
  app.route("/syncs", syncRoutes(deps.syncs));
  return app;
};
