/**
 * The Firmenverwaltung under /api/company: people and shared mailboxes of the company. Only users
 * with the company role may use it; the server works with its own Stalwart key and allows only
 * what is here (no roles beyond the mark, no other accounts, no server settings).
 */
import { Hono } from "hono";
import { retentionSchema } from "../chat/chat";
import { migrationRoutes } from "../migration/routes";
import { syncRoutes } from "../migration/sync-routes";
import { authorityRoutes } from "../smime/authorities";
import { backupRoutes } from "./backup-routes";
import { bad, bodyOf, type CompanyDeps, createLoader, type Env } from "./context";
import { employeeRoutes } from "./employees";
import { externalHintRoutes, readExternalHint } from "./external-hint";
import { idleLogoutRoutes, readIdleLogout } from "./idle-logout";
import { legalFooterRoutes, readLegalFooter } from "./legal-footer";
import { mailboxRoutes } from "./mailboxes";
import { checkDomain, httpsCheck } from "./security";
import { signatureRoutes } from "./signature-routes";

export type { CompanyDeps };

export const createCompanyRoutes = (deps: CompanyDeps) => {
  const load = createLoader(deps);
  const app = new Hono<Env>();
  const externalHint = readExternalHint(deps);
  const legalFooter = readLegalFooter(deps);
  const idleLogout = readIdleLogout(deps);

  /** Whether to show the Firmenverwaltung at all; asked by every signed-in user. */
  app.get("/me", async (c) =>
    c.json({ admin: Boolean(await load(c.req.raw, { folders: false })) }),
  );

  /** Hinweis „Extern“: every signed-in user's mail app marks and asks with it. */
  app.get("/external-hint", async (c) => {
    const hint = await externalHint(c.req.raw);
    return hint ? c.json(hint) : c.json({ error: "Nicht angemeldet" }, 401);
  });

  /** Pflichtangaben: every signed-in user's composer puts them under the mail it sends. */
  app.get("/legal-footer", async (c) => {
    const footer = await legalFooter(c.req.raw);
    return footer ? c.json(footer) : c.json({ error: "Nicht angemeldet" }, 401);
  });

  /** Abmelden nach Inaktivität: every signed-in user's app counts the time without input. */
  app.get("/idle-logout", async (c) => {
    const setting = await idleLogout(c.req.raw);
    return setting ? c.json(setting) : c.json({ error: "Nicht angemeldet" }, 401);
  });

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
  app.route("/external-hint", externalHintRoutes(deps));
  app.route("/legal-footer", legalFooterRoutes(deps));
  app.route("/idle-logout", idleLogoutRoutes(deps));
  app.get("/chat-retention", async (c) =>
    c.json({ days: (await deps.chatRetention?.days()) ?? 0 }),
  );
  app.put("/chat-retention", async (c) => {
    const body = await bodyOf(c, retentionSchema);
    if (!body || !deps.chatRetention) return bad("Angaben unvollständig.");
    await deps.chatRetention.setDays(body.days);
    return c.json({ days: body.days, removed: (await deps.pruneChat?.()) ?? 0 });
  });
  /** How safe the company's mail travels: DNS of every domain, and https for Kontext. */
  app.get("/security", async (c) => {
    const security = deps.security;
    if (!security) return c.json({ https: null, domains: [] });
    const fetchPolicy =
      security.fetchPolicy ??
      (async (url: string) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        return response.ok ? response.text() : null;
      });
    const domains = c.get("loaded").company.domains.map((domain) => domain.name);
    return c.json({
      https: httpsCheck(security.publicUrl),
      domains: await Promise.all(
        domains.map((domain) => checkDomain(domain, security.resolve, fetchPolicy)),
      ),
    });
  });
  if (deps.smimeAuthorities) {
    app.route("/smime-authorities", authorityRoutes(deps.smimeAuthorities));
  }
  if (deps.backup) app.route("/backup", backupRoutes(deps.backup));
  app.route("/migrations", migrationRoutes(deps.migrations));
  app.route("/syncs", syncRoutes(deps.syncs));
  return app;
};
