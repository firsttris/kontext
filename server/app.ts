/**
 * The Kontext server: sign-in (Better Auth) under /api/auth and a pass-through of JMAP to
 * Stalwart that adds the session's Stalwart token. The browser never holds a password or token.
 */

import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { type Auth, createAuth, createGrants, type Grants } from "./auth";
import { createCategoryRoutes, type SessionAccount } from "./categories/routes";
import { createCategoryStore } from "./categories/store";
import { createChatFiles } from "./chat/files";
import { createMessageStore } from "./chat/messages";
import { createChatRoutes, viewerOf } from "./chat/routes";
import { createChatStore } from "./chat/store";
import { createMailstore } from "./company/mailstore";
import {
  createDownload,
  createManagement,
  createRequest,
  createUpload,
} from "./company/management";
import { createCompanyRoutes } from "./company/routes";
import { createCompanySettings } from "./company/settings";
import { createSealer } from "./crypto";
import { type Db, openDatabase, schema } from "./db";
import type { Env } from "./env";
import { createHub } from "./live/hub";
import { createLiveRoutes } from "./live/routes";
import { createImporter } from "./migration/importer";
import { createJobs } from "./migration/jobs";
import { createGraph, type M365Credentials } from "./migration/m365/graph";
import { createRunner } from "./migration/runner";
import { createSyncRunner } from "./migration/sync-runner";
import { createSyncs } from "./migration/syncs";
import { createTaskRoutes } from "./tasks/routes";
import { createTaskStore } from "./tasks/store";

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

/** How long the accounts of a session are taken as they were ("schreibt …" asks every 3 s). */
const ACCOUNTS_FRESH_MS = 30_000;

/**
 * The accounts in the signed-in person's JMAP session, asked of Stalwart with their token and
 * kept for half a minute per session; a change of access (someone left info@) counts after that.
 */
const sessionAccountsOf = (env: Env, auth: Auth, grants: Grants) => {
  const known = new Map<string, { accounts: SessionAccount[]; until: number }>();
  return async (request: Request): Promise<SessionAccount[] | null> => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return null;
    const now = Date.now();
    const cached = known.get(session.session.id);
    if (cached && cached.until > now) return cached.accounts;
    const token = await grants.accessToken(session.session.id);
    if (!token) return null;
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const { accounts } = (await response.json()) as {
      accounts: Record<string, { isReadOnly?: boolean; isPersonal?: boolean }>;
    };
    const list = Object.entries(accounts).map(([id, account]) => ({
      id,
      isReadOnly: Boolean(account.isReadOnly),
      isPersonal: Boolean(account.isPersonal),
    }));
    for (const [id, entry] of known) if (entry.until <= now) known.delete(id);
    known.set(session.session.id, { accounts: list, until: now + ACCOUNTS_FRESH_MS });
    return list;
  };
};

/** Ends all Kontext sessions of a user; their Stalwart tokens go with them (cascade). */
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

  const categories = createCategoryStore(db);
  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  if (env.STALWART_ADMIN_KEY) {
    const request = createRequest(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const upload = createUpload(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const jobs = createJobs(db);
    const workDir = join(dirname(env.DATABASE_PATH), "migrations");
    const importer = createImporter(request, upload, categories);
    const runner = createRunner({ jobs, importer, workDir });
    await runner.resume();
    const syncs = createSyncs(db);
    const syncSealer = await createSealer(env.BETTER_AUTH_SECRET, "mail-sync");
    const settings = createCompanySettings(db, syncSealer);
    const graphUrls = { login: env.M365_LOGIN_URL, graph: env.GRAPH_URL };
    const microsoft = {
      load: settings.m365,
      save: settings.saveM365,
      graph: (credentials: M365Credentials) => createGraph(credentials, graphUrls),
    };
    const allowPlain = env.MAIL_SYNC_ALLOW_PLAIN;
    const syncRunner = createSyncRunner({
      syncs,
      importer,
      sealer: syncSealer,
      allowPlain,
      microsoft: async () => {
        const credentials = await settings.m365();
        return credentials ? microsoft.graph(credentials) : null;
      },
    });
    await syncRunner.start();
    const company = createCompanyRoutes({
      categories,
      management: createManagement(request),
      mailstore: createMailstore(
        request,
        upload,
        createDownload(env.STALWART_URL, env.STALWART_ADMIN_KEY),
      ),
      settings,
      migrations: { jobs, runner, workDir },
      syncs: { syncs, runner: syncRunner, sealer: syncSealer, allowPlain, microsoft },
      currentEmail: async (request) =>
        (await auth.api.getSession({ headers: request.headers }))?.user.email ?? null,
      endSessions: endSessionsOf(db),
    });
    app.route("/api/company", company);
  }
  const accountsOf = sessionAccountsOf(env, auth, grants);
  const hub = createHub();
  app.route(
    "/api/live",
    createLiveRoutes({
      hub,
      viewerOf: async (request) => {
        const accounts = await accountsOf(request);
        return accounts && viewerOf(accounts);
      },
    }),
  );
  const chatFiles = createChatFiles(db, join(dirname(env.DATABASE_PATH), "chat-files"));
  // Photos uploaded for a message that was never sent go after a day.
  const pruneChatFiles = () =>
    void chatFiles.pruneUnsent(new Date(Date.now() - 86_400_000)).catch(() => undefined);
  pruneChatFiles();
  setInterval(pruneChatFiles, 3_600_000).unref();
  const messages = createMessageStore(db, chatFiles);
  app.route(
    "/api/chat",
    createChatRoutes({
      store: createChatStore(db, messages),
      messages,
      files: chatFiles,
      hub,
      accountsOf,
    }),
  );
  app.route(
    "/api/tasks",
    createTaskRoutes({
      store: createTaskStore(db),
      accountsOf,
      changed: (accountId) =>
        hub.publish({ type: "tasks", accountId }, (viewer) =>
          viewer.accountIds.includes(accountId),
        ),
    }),
  );
  app.route(
    "/api/categories",
    createCategoryRoutes({
      store: categories,
      accountsOf,
    }),
  );
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
    // The service worker, the page and the manifest are asked for again every time: a new
    // version must never hang in a cache (the worker itself then caches by content hash).
    const fresh = (path: string) => /(\/service-worker\.js|\.html|\.webmanifest)$/.test(path);
    app.use(
      "*",
      serveStatic({
        root,
        onFound: (path, c) => {
          if (fresh(path)) c.header("cache-control", "no-cache");
        },
      }),
    );
    // Every other path belongs to the app's router.
    app.get(
      "*",
      serveStatic({
        root,
        path: "index.html",
        onFound: (_path, c) => c.header("cache-control", "no-cache"),
      }),
    );
  }
  return { app, auth, db };
};
