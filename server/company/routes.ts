/**
 * The Firmenverwaltung under /api/company: people and shared mailboxes of the company. Only users
 * with the company role may use it; the server works with its own Stalwart key and allows only
 * what is here (no roles beyond the mark, no other accounts, no server settings).
 */
import { Hono } from "hono";
import { type CompanyDeps, createLoader, type Env } from "./context";
import { employeeRoutes } from "./employees";
import { mailboxRoutes } from "./mailboxes";

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
  return app;
};
