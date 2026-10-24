/**
 * Moves from Gmail & Co. under /api/company/syncs (behind the Firmenverwaltung's guard): connect
 * with address and (app) password, which are checked at once; run now; new password; finish.
 */
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type Env, notFound, userOf } from "../company/context";
import type { Sealer } from "../crypto";
import { openImap } from "./imap-source";
import { endpointFor, type ProviderId } from "./providers";
import type { SyncRunner } from "./sync-runner";
import type { Sync, Syncs } from "./syncs";

export type SyncDeps = {
  syncs: Syncs;
  runner: SyncRunner;
  sealer: Sealer;
  /** Tests against the local Stalwart: any port, IMAP without TLS. */
  allowPlain?: boolean;
};

const newSync = z.object({
  accountId: z.string().max(64),
  provider: z.enum(["gmail", "gmx", "webde", "t-online", "ionos", "strato", "other"]),
  host: z.string().max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  login: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(1024),
});
const newPassword = z.object({ password: z.string().min(1).max(1024) });

/** What the browser sees: everything but the sealed password. */
const publicSync = ({ secret: _, ...sync }: Sync) => sync;

export const syncRoutes = ({ syncs, runner, sealer, allowPlain = false }: SyncDeps) => {
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

  app.post("/", async (c) => {
    const body = await bodyOf(c, newSync);
    if (!body) return bad("Angaben unvollständig.");
    const user = userOf(c.get("loaded"), body.accountId);
    if (!user) return bad("Unbekannte Person.");
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
