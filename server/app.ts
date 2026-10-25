/**
 * The Kontext server: sign-in (Better Auth) under /api/auth and a pass-through of JMAP to
 * Stalwart that adds the session's Stalwart token. The browser never holds a password or token.
 */

import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { type Auth, createAuth, createGrants, type Grants } from "./auth";
import { currentRoomEvents, type LiveKitConfig } from "./calls/livekit";
import { createMeetRoutes } from "./calls/meet-routes";
import { createCallRoutes, createCallState } from "./calls/routes";
import { createCategoryRoutes } from "./categories/routes";
import { createCategoryStore } from "./categories/store";
import { createChatFiles } from "./chat/files";
import { backfillFolded } from "./chat/message-parts";
import { createMessageStore } from "./chat/messages";
import { createChatPruner, createChatRetention } from "./chat/retention";
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
import { dohResolver } from "./company/security";
import { createCompanySettings } from "./company/settings";
import { createSealer } from "./crypto";
import { createDavAuth } from "./dav/auth";
import { createDavRoutes } from "./dav/routes";
import { type Db, openDatabase, schema } from "./db";
import type { Env } from "./env";
import { createFetcher } from "./external/fetcher";
import { createExternalRoutes } from "./external/routes";
import { createSmtp } from "./external/smtp";
import { createExternalStore } from "./external/store";
import { createUserJmap } from "./external/user-jmap";
import { createImageSenderRoutes } from "./images/routes";
import { createHub } from "./live/hub";
import { createLiveRoutes } from "./live/routes";
import { createImporter, type Importer } from "./migration/importer";
import { createJobs } from "./migration/jobs";
import { createGraph, type M365Credentials } from "./migration/m365/graph";
import { createRunner } from "./migration/runner";
import { createSyncRunner } from "./migration/sync-runner";
import { createSyncs } from "./migration/syncs";
import { createPgpRoutes, createWkdRoutes } from "./pgp/routes";
import { createPgpStore } from "./pgp/store";
import { createPhone } from "./phone/setup";
import { createMailWatch } from "./push/mail-watch";
import { createPusher } from "./push/pusher";
import { createPushRoutes } from "./push/routes";
import { createPushStore, loadVapidKeys } from "./push/store";
import { createSecurePublicRoutes, createSecureRoutes } from "./secure/routes";
import { createSecureStore } from "./secure/store";
import { createSessionInfo } from "./session-info";
import { createSmimeRoutes, trustedRoots } from "./smime/routes";
import { createSmimeStore } from "./smime/store";
import { createSnippetRoutes } from "./snippets/routes";
import { createSnippetStore } from "./snippets/store";
import { createSnoozeRoutes } from "./snooze/routes";
import { createSnoozeStore } from "./snooze/store";
import { createSnoozeWaker } from "./snooze/waker";
import { createRuleTasks } from "./tasks/from-rules";
import { createTaskReminder } from "./tasks/notices";
import { createTaskRoutes } from "./tasks/routes";
import { createTaskStore } from "./tasks/store";
import { createUnsubscribeRoutes } from "./unsubscribe/routes";

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

/** Ends all Kontext sessions of a user; their Stalwart tokens go with them (cascade). */
const endSessionsOf = (db: Db) => async (email: string) => {
  const [found] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (found) await db.delete(schema.session).where(eq(schema.session.userId, found.id));
};

/** LiveKit, when all three settings are there; calls are off otherwise. */
const liveKitOf = (env: Env): LiveKitConfig | null =>
  env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
    ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }
    : null;

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

  const chatFiles = createChatFiles(db, join(dirname(env.DATABASE_PATH), "chat-files"));
  // Photos uploaded for a message that was never sent go after a day.
  const pruneChatFiles = () =>
    void chatFiles.pruneUnsent(new Date(Date.now() - 86_400_000)).catch(() => undefined);
  pruneChatFiles();
  setInterval(pruneChatFiles, 3_600_000).unref();
  const messages = createMessageStore(db, chatFiles);
  // Messages from before the search text was kept get it once.
  void backfillFolded(db).catch((error: Error) => console.warn(`Chat-Suche: ${error.message}`));
  // What is older than the company keeps goes, at start and every hour.
  const chatRetention = createChatRetention(db);
  const chatPruner = createChatPruner({ retention: chatRetention, messages });
  const pruneChat = () =>
    void chatPruner.tick().catch((error: Error) => console.warn(`Chat: ${error.message}`));
  pruneChat();
  setInterval(pruneChat, 3_600_000).unref();
  app.get("/healthz", (c) => c.text("ok"));
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  /** Fetching for external accounts imports with the server's key, like a move. */
  let externalImporter: Importer | null = null;
  if (env.STALWART_ADMIN_KEY) {
    const request = createRequest(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const upload = createUpload(env.STALWART_URL, env.STALWART_ADMIN_KEY);
    const jobs = createJobs(db);
    const workDir = join(dirname(env.DATABASE_PATH), "migrations");
    const importer = createImporter(request, upload, categories);
    externalImporter = importer;
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
      chatRetention,
      pruneChat: chatPruner.tick,
      security: { publicUrl: env.BETTER_AUTH_URL, resolve: dohResolver(env.DOH_URL) },
    });
    app.route("/api/company", company);
  }
  const { accountsOf, infoOf } = createSessionInfo(env, auth, grants);
  if (externalImporter) {
    // Other mailboxes of a person (Gmail, GMX, …): fetched into Kontext, sent through them.
    const store = createExternalStore(db);
    const sealer = await createSealer(env.BETTER_AUTH_SECRET, "external-account");
    const allowPlain = env.MAIL_SYNC_ALLOW_PLAIN;
    const fetcher = createFetcher({ store, importer: externalImporter, sealer, allowPlain });
    (await fetcher.start()).unref();
    app.route(
      "/api/external-accounts",
      createExternalRoutes({
        store,
        fetcher,
        sealer,
        smtp: createSmtp(allowPlain),
        infoOf,
        jmapFor: createUserJmap(env, grants),
        allowPlain,
      }),
    );
  }
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

  // Web Push: chat messages to oneself and new mail, also with Kontext closed.
  const pushStore = createPushStore(db);
  const vapid = await loadVapidKeys(db, await createSealer(env.BETTER_AUTH_SECRET, "web-push"));
  const pusher = createPusher({
    store: pushStore,
    keys: vapid,
    subject: new URL(env.BETTER_AUTH_URL).origin,
  });
  const mailWatch = createMailWatch({ env, grants, store: pushStore, pusher });
  const watchMail = () => void mailWatch.refresh().catch(() => undefined);
  watchMail();
  // Sessions end (signing out removes their subscriptions): look again now and then.
  setInterval(watchMail, 5 * 60_000).unref();
  app.route(
    "/api/push",
    createPushRoutes({
      store: pushStore,
      publicKey: vapid.publicKey,
      infoOf,
      changed: watchMail,
      anyEndpoint: env.PUSH_ANY_ENDPOINT,
    }),
  );
  const chatStore = createChatStore(db, messages);
  const livekit = liveKitOf(env);
  if (livekit) {
    const callState = createCallState();
    const viewerOfRequest = async (request: Request) => {
      const accounts = await accountsOf(request);
      return accounts && viewerOf(accounts);
    };
    const nameOfRequest = async (request: Request) => (await infoOf(request))?.name ?? "";
    const phone = createPhone({
      db,
      sealer: await createSealer(env.BETTER_AUTH_SECRET, "phone"),
      hub,
      livekit,
      publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
      trunkHost: env.PHONE_SIP_HOST ?? new URL(env.BETTER_AUTH_URL).hostname,
      trunkPort: env.PHONE_SIP_PORT,
      viewerOf: viewerOfRequest,
      nameOf: nameOfRequest,
      notify: pusher.notify,
    });
    app.route("/api/phone", phone.routes);
    // Behind the Firmenverwaltung's check, which runs first for every /api/company path.
    if (env.STALWART_ADMIN_KEY) app.route("/api/company/phone", phone.adminRoutes);
    const calls = createCallRoutes(
      {
        livekit,
        publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
        hub,
        channelOf: chatStore.get,
        viewerOf: viewerOfRequest,
        nameOf: nameOfRequest,
        notify: pusher.notify,
        onRoomEvent: phone.onRoomEvent,
        postCall: (channelId, authorId, call) =>
          messages.post({
            channelId,
            authorId,
            text: "",
            mentions: [],
            cards: [],
            fileIds: [],
            call,
          }),
      },
      callState,
    );
    app.route("/api/calls", calls.app);
    app.route(
      "/api/meet",
      createMeetRoutes(
        {
          livekit,
          publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
          origin: new URL(env.BETTER_AUTH_URL).origin,
          viewerOf: viewerOfRequest,
          nameOf: nameOfRequest,
        },
        callState,
      ),
    );
    // Calls that ran through a restart of this server: LiveKit still knows who is in them.
    void currentRoomEvents(livekit)
      .then(async (events) => {
        for (const event of events) await calls.receive(event);
      })
      .catch(() => undefined);
  } else {
    // The app asks; without LiveKit it shows no call buttons and no telephony.
    app.get("/api/calls", (c) => c.json({ enabled: false, calls: [] }));
    app.get("/api/phone", (c) =>
      c.json({ enabled: false, allowed: false, online: false, calls: [] }),
    );
  }
  app.route(
    "/api/chat",
    createChatRoutes({
      store: chatStore,
      messages,
      files: chatFiles,
      hub,
      accountsOf,
      notify: pusher.notify,
      nameOf: async (request) => (await infoOf(request))?.name ?? "",
      retentionDays: chatRetention.days,
      publicKeyOf: async (memberId) => {
        const own = await createPgpStore(db).own(memberId);
        return own
          ? { publicKey: own.publicKey, email: own.email, fingerprint: own.fingerprint }
          : null;
      },
    }),
  );
  // Task reminders go out every minute, also with nobody signed in.
  const tasks = createTaskStore(db);
  const reminder = createTaskReminder({ store: tasks, notify: pusher.notify });
  setInterval(() => void reminder.tick(), env.REMINDER_TICK_MS).unref();
  app.route(
    "/api/tasks",
    createTaskRoutes({
      store: tasks,
      accountsOf,
      notify: pusher.notify,
      nameOf: async (request) => (await infoOf(request))?.name ?? "",
      changed: (accountId, assignees) =>
        hub.publish(
          { type: "tasks", accountId },
          (viewer) => viewer.accountIds.includes(accountId) || assignees.includes(viewer.me),
        ),
    }),
  );
  app.route("/api/snippets", createSnippetRoutes({ store: createSnippetStore(db), accountsOf }));
  // Wiedervorlage: due mails come back every minute, also with nobody signed in.
  const snoozes = createSnoozeStore(db);
  const waker = createSnoozeWaker({ env, grants, store: snoozes, notify: pusher.notify });
  setInterval(() => void waker.tick(), env.SNOOZE_TICK_MS).unref();
  app.route("/api/snoozes", createSnoozeRoutes({ store: snoozes, infoOf }));
  app.route("/api/unsubscribe", createUnsubscribeRoutes({ env, grants, infoOf }));
  app.route("/api/image-senders", createImageSenderRoutes({ db, accountsOf }));
  // OpenPGP: one's own key (locked in the browser), others' keys, and WKD for the company.
  const pgp = createPgpStore(db);
  app.route("/api/pgp", createPgpRoutes({ store: pgp, accountsOf }));
  app.route("/.well-known/openpgpkey", createWkdRoutes(pgp));
  app.route(
    "/api/smime",
    createSmimeRoutes({
      store: createSmimeStore(db),
      accountsOf,
      roots: trustedRoots(env.SMIME_ROOTS),
      resolve: dohResolver(env.DOH_URL),
    }),
  );
  // "Vertraulich senden": encrypted messages for recipients without a key, opened with a code.
  const secure = createSecureStore(db, join(dirname(env.DATABASE_PATH), "secure"));
  app.route("/api/secure", createSecureRoutes({ store: secure, accountsOf }));
  app.route(
    "/api/secure-public",
    createSecurePublicRoutes({ store: secure, notify: pusher.notify }),
  );
  const pruneSecure = () => void secure.pruneExpired(new Date()).catch(() => undefined);
  pruneSecure();
  setInterval(pruneSecure, 3_600_000).unref();
  // The task boards for Thunderbird and phone apps (CalDAV), signed in with the mail password.
  app.all("/.well-known/caldav", (c) => c.redirect("/dav/", 301));
  app.route(
    "/dav",
    createDavRoutes({
      auth: createDavAuth(env),
      store: tasks,
      changed: (accountId) =>
        hub.publish({ type: "tasks", accountId }, (viewer) =>
          viewer.accountIds.includes(accountId),
        ),
    }),
  );
  // Mails a rule marked "Aufgabe anlegen" become tasks, every minute, also with nobody signed in.
  const ruleTasks = createRuleTasks({
    env,
    grants,
    sessions: () => snoozes.sessionsFor(""),
    store: tasks,
    changed: (accountId) =>
      hub.publish({ type: "tasks", accountId }, (viewer) => viewer.accountIds.includes(accountId)),
  });
  setInterval(() => void ruleTasks.tick(), env.RULE_TASK_TICK_MS).unref();
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
