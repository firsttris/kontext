/**
 * The Sekretär server: sign-in (Better Auth) under /api/auth and a pass-through of JMAP to
 * Stalwart that adds the session's Stalwart token. The browser never holds a password or token.
 */

import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { type Auth, createAuth, createGrants, type Grants } from "./auth";
import { createMailstore } from "./company/mailstore";
import { createManagement, createRequest, createUpload } from "./company/management";
import { createCompanyRoutes } from "./company/routes";
import { createCompanySettings } from "./company/settings";
import { createSealer } from "./crypto";
import { type Db, openDatabase, schema } from "./db";
import type { Env } from "./env";
import { createImporter } from "./migration/importer";
import { createJobs } from "./migration/jobs";
import { createRunner } from "./migration/runner";

/** Request headers that go on to Stalwart; cookies and the browser's own auth stay here. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-length",
  "last-event-id",
  "accept-language",
];
/** Response headers that come back; hop-by-hop headers are dropped. */
const DROPPED_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "set-cookie",
  "www-authenticate",
];

export const createJmapProxy =
  (env: Env, auth: Auth, grants: Grants) =>
  async (request: Request): Promise<Response> => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const token = await grants.accessToken(session.session.id);
    if (!token) {
      await auth.api.revokeSession({
        headers: request.headers,
        body: { token: session.session.token },
      });
      return Response.json({ error: "Anmeldung abgelaufen" }, { status: 401 });
    }

    const url = new URL(request.url);
    const headers = new Headers({ authorization: `Bearer ${token}` });
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

    const upstream = await fetch(`${env.STALWART_URL}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: request.signal,
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    responseHeaders.set("cache-control", responseHeaders.get("cache-control") ?? "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };

/** Ends all Sekretär sessions of a user; their Stalwart tokens go with them (cascade). */
const endSessionsOf = (db: Db) => async (email: string) => {
  const [found] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (found) await db.delete(schema.session).where(eq(schema.session.userId, found.id));
};

export const createApp = async (env: Env) => {
  const db = openDatabase(env.DATABASE_PATH);
  const grants = createGrants(
    db,
    await createSealer(env.BETTER_AUTH_SECRET, "stalwart-grant"),
    env.STALWART_URL,
  );
  const auth = createAuth(env, db, grants);
  const proxy = createJmapProxy(env, auth, grants);

  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  if (env.STALWART_ADMIN_KEY) {
    const request = createRequest(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const upload = createUpload(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const jobs = createJobs(db);
    const workDir = join(dirname(env.DATABASE_PATH), "migrations");
    const runner = createRunner({ jobs, importer: createImporter(request, upload), workDir });
    await runner.resume();
    const company = createCompanyRoutes({
      management: createManagement(request),
      mailstore: createMailstore(request, upload),
      settings: createCompanySettings(db),
      migrations: { jobs, runner, workDir },
      currentEmail: async (request) =>
        (await auth.api.getSession({ headers: request.headers }))?.user.email ?? null,
      endSessions: endSessionsOf(db),
    });
    app.route("/api/company", company);
  }
  app.all("/jmap", (c) => proxy(c.req.raw));
  app.all("/jmap/*", (c) => proxy(c.req.raw));
  if (env.STATIC_DIR) {
    const root = env.STATIC_DIR;
    app.use(
      "/assets/*",
      serveStatic({
        root,
        onFound: (_path, c) => c.header("cache-control", "public, max-age=31536000, immutable"),
      }),
    );
    app.use("*", serveStatic({ root }));
    // Every other path belongs to the app's router.
    app.get("*", serveStatic({ root, path: "index.html" }));
  }
  return { app, auth, db };
};
