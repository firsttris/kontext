/**
 * Moves from Gmail & Co. under /api/company/syncs (behind the Firmenverwaltung's guard): connect
 * with address and (app) password, which are checked at once; run now; new password; finish.
 */
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type Env, notFound, userOf } from "../company/context";
import type { Sealer } from "../crypto";
import { openImap } from "./imap-source";
import type { Graph, M365Credentials } from "./m365/graph";
import { endpointFor, type ProviderId } from "./providers";
import type { SyncRunner } from "./sync-runner";
import type { Sync, Syncs } from "./syncs";

export type SyncDeps = {
  syncs: Syncs;
  runner: SyncRunner;
  sealer: Sealer;
  /** The company's Microsoft 365 app: stored credentials and a Graph client for them. */
  microsoft: {
    load: () => Promise<M365Credentials | null>;
    save: (credentials: M365Credentials) => Promise<void>;
    graph: (credentials: M365Credentials) => Graph;
  };
  /** Tests against the local Stalwart: any port, IMAP without TLS. */
  allowPlain?: boolean;
};

const newSync = z.object({
  accountId: z.string().max(64),
  provider: z.enum(["gmail", "gmx", "webde", "t-online", "ionos", "strato", "other", "m365"]),
  host: z.string().max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  login: z.string().trim().min(3).max(320),
  /** Not for Microsoft 365: the company's app reads the mailbox. */
  password: z.string().max(1024).default(""),
});
const m365Credentials = z.object({
  tenantId: z.string().trim().min(1).max(100),
  clientId: z.string().trim().min(1).max(100),
  clientSecret: z.string().trim().min(1).max(500),
});
type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName: string;
};
const newPassword = z.object({ password: z.string().min(1).max(1024) });

/** What the browser sees: everything but the sealed password. */
const publicSync = ({ secret: _, ...sync }: Sync) => sync;

export const syncRoutes = ({ syncs, runner, sealer, microsoft, allowPlain = false }: SyncDeps) => {
  /** Logs in once to see that address and password work; null or the reason in words. */
  const check = async (
    endpoint: { host: string; port: number },
    login: string,
    password: string,
  ) => {
    const opened = await openImap(endpoint, { user: login, password }, allowPlain);
    if (opened.ok) {
      await opened.value.close();
      return null;
    }
    return opened.error.reason === "login"
      ? "Anmeldung abgelehnt: Adresse oder (App-)Passwort stimmen nicht, oder IMAP ist beim Anbieter nicht eingeschaltet."
      : `Der Server antwortet nicht (${opened.error.message}).`;
  };

  const app = new Hono<Env>();

  app.get("/", async (c) => {
    const ids = new Set(c.get("loaded").company.employees.map((e) => e.id));
    return c.json((await syncs.list()).filter((s) => ids.has(s.accountId)).map(publicSync));
  });

  /** The mailboxes of the company's Microsoft 365, to choose from; whether it is connected. */
  app.get("/m365", async (c) => {
    const credentials = await microsoft.load();
    if (!credentials) return c.json({ connected: false, users: [] });
    try {
      const { items } = await microsoft
        .graph(credentials)
        .all<GraphUser>("/users?$select=id,displayName,mail,userPrincipalName&$top=999");
      return c.json({
        connected: true,
        tenantId: credentials.tenantId,
        users: items.map((u) => ({
          login: u.userPrincipalName,
          name: u.displayName ?? u.userPrincipalName,
          address: u.mail ?? u.userPrincipalName,
        })),
      });
    } catch (error) {
      return c.json({
        connected: true,
        tenantId: credentials.tenantId,
        users: [],
        error: (error as Error).message,
      });
    }
  });

  /** Connects the company's Microsoft 365 app; checked with a token and the list of users. */
  app.put("/m365", async (c) => {
    const body = await bodyOf(c, m365Credentials);
    if (!body) return bad("Angaben unvollständig.");
    const graph = microsoft.graph(body);
    const authorized = await graph.authorize();
    if (!authorized.ok) return bad(`Microsoft lehnt die Anmeldung ab: ${authorized.error}`);
    try {
      await graph.get("/users?$select=id&$top=1");
    } catch (error) {
      return bad(`Angemeldet, aber ohne Rechte: ${(error as Error).message}`);
    }
    await microsoft.save(body);
    return c.json({ ok: true });
  });

  app.post("/", async (c) => {
    const body = await bodyOf(c, newSync);
    if (!body) return bad("Angaben unvollständig.");
    const user = userOf(c.get("loaded"), body.accountId);
    if (!user) return bad("Unbekannte Person.");
    if (body.provider === "m365") {
      const credentials = await microsoft.load();
      if (!credentials) return bad("Microsoft 365 ist noch nicht verbunden.");
      const found = await microsoft
        .graph(credentials)
        .get(`/users/${encodeURIComponent(body.login)}?$select=id`)
        .then(() => true)
        .catch(() => false);
      if (!found) return bad(`Das Postfach ${body.login} gibt es in Microsoft 365 nicht.`);
      const sync = await syncs.create({
        accountId: user.id,
        accountEmail: user.emailAddress ?? "",
        provider: "m365",
        host: "graph.microsoft.com",
        port: 443,
        login: body.login,
        secret: "",
      });
      void runner.enqueue(sync.id);
      return c.json(publicSync(sync), 201);
    }
    if (!body.password) return bad("Angaben unvollständig.");
    const endpoint = endpointFor(body.provider as ProviderId, body, allowPlain);
    if (!endpoint) return bad("Server oder Port ungültig (IMAP: 993 oder 143).");
    const problem = await check(endpoint, body.login, body.password);
    if (problem) return bad(problem);
    const sync = await syncs.create({
      accountId: user.id,
      accountEmail: user.emailAddress ?? "",
      provider: body.provider,
      ...endpoint,
      login: body.login,
      secret: await sealer.seal(body.password),
    });
    void runner.enqueue(sync.id);
    return c.json(publicSync(sync), 201);
  });

  app.post("/:id/run", async (c) => {
    const sync = await syncs.get(c.req.param("id"));
    if (sync?.status !== "active") return notFound();
    void runner.enqueue(sync.id);
    return c.json({ ok: true });
  });

  /** After the password was changed at the provider. */
  app.put("/:id/password", async (c) => {
    const sync = await syncs.get(c.req.param("id"));
    if (!sync || sync.status === "finished") return notFound();
    const body = await bodyOf(c, newPassword);
    if (!body) return bad("Angaben unvollständig.");
    const problem = await check(sync, sync.login, body.password);
    if (problem) return bad(problem);
    await syncs.update(sync.id, {
      secret: await sealer.seal(body.password),
      status: "active",
      lastError: null,
    });
    void runner.enqueue(sync.id);
    return c.json({ ok: true });
  });

  /** The move is done: no more runs; the password is no longer needed. */
  app.post("/:id/finish", async (c) => {
    const sync = await syncs.get(c.req.param("id"));
    if (!sync || sync.status === "running") return bad("Läuft gerade, bitte gleich noch einmal.");
    await syncs.update(sync.id, { status: "finished", secret: "" });
    return c.json({ ok: true });
  });

  return app;
};
