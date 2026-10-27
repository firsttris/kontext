/**
 * The Kontext server: sign-in (Better Auth) under /api/auth and a pass-through of JMAP to
 * Stalwart that adds the session's Stalwart token. The browser never holds a password or token.
 */

import { dirname, join } from "node:path";
import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { version as packageVersion } from "../package.json";
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
import { createBackupControl } from "./company/backup";
import { createCalendars } from "./company/calendars";
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
import { fromOwnPage } from "./csrf";
import { createDavAuth } from "./dav/auth";
import { createDavRoutes } from "./dav/routes";
import { type Db, openDatabase, schema } from "./db";
import { createSessionBlobs } from "./documents/blobs";
import { createCompanyMailboxes } from "./documents/company-mailboxes";
import { createFolderIds } from "./documents/folder-ids";
import { createMailboxFolders, type MailboxFolders } from "./documents/mailboxes";
import { createDocumentsRoutes } from "./documents/routes";
import { createSchreibzeug, type Schreibzeug } from "./documents/schreibzeug";
import type { Env } from "./env";
import { createFetcher } from "./external/fetcher";
import { createExternalRoutes } from "./external/routes";
import { createSmtp } from "./external/smtp";
import { createExternalStore } from "./external/store";
import { createUserJmap } from "./external/user-jmap";
import { appPolicy, hardenDownload, isDownload, withAppHeaders } from "./headers";
import { createImageSenderRoutes } from "./images/routes";
import { createInvitationRoutes, createRsvpRoutes } from "./invitations/routes";
import { createRsvp } from "./invitations/rsvp";
import { createRsvpTokens } from "./invitations/token";
import { createServerJmap } from "./jmap-server";
import { createHub } from "./live/hub";
import { createLiveRoutes } from "./live/routes";
import { createAttempts } from "./mcp/attempts";
import { createConnections } from "./mcp/connections";
import { createOAuthCaller, createRevokeClient, jwtVerifier } from "./mcp/oauth";
import { createConsentRoutes } from "./mcp/oauth-routes";
import { createMcpEndpoint, createMcpKeyRoutes, type McpDeps } from "./mcp/routes";
import { taskApiOf } from "./mcp/writer";
import { createImporter, type Importer } from "./migration/importer";
import { createJobs } from "./migration/jobs";
import { createGraph, type M365Credentials } from "./migration/m365/graph";
import { createRunner } from "./migration/runner";
import { createSyncRunner } from "./migration/sync-runner";
import { createSyncs } from "./migration/syncs";
import { registerClient, type SchreibzeugClient, schreibzeugClientOf } from "./oidc/provider";
import { createPgpRoutes, createWkdRoutes } from "./pgp/routes";
import { createPgpStore } from "./pgp/store";
import { createPhone } from "./phone/setup";
import { createPhotoRoutes } from "./photos/routes";
import { createPhotoStore } from "./photos/store";
import { createPlaceRoutes } from "./places/routes";
import { createMailWatch } from "./push/mail-watch";
import { createPusher } from "./push/pusher";
import { createPushRoutes } from "./push/routes";
import { createPushStore, loadVapidKeys } from "./push/store";
import { createSecurePublicRoutes, createSecureRoutes } from "./secure/routes";
import { createSecureStore } from "./secure/store";
import { createNameOf, createSessionInfo } from "./session-info";
import { createSmimeRoutes, trustedRoots } from "./smime/routes";
import { createSmimeStore } from "./smime/store";
import { createSnippetRoutes } from "./snippets/routes";
import { createSnippetStore } from "./snippets/store";
import { createSnoozeRoutes } from "./snooze/routes";
import { createSnoozeStore } from "./snooze/store";
import { createSnoozeWaker } from "./snooze/waker";
import { loginAtStalwart } from "./stalwart";
import { tokenOrUnavailable, unavailable } from "./stalwart-away";
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
    const token = await tokenOrUnavailable(grants, session.session.id);
    if (token === "unavailable") return unavailable();
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
    if (isDownload(url.pathname)) hardenDownload(responseHeaders);
    responseHeaders.set("cache-control", responseHeaders.get("cache-control") ?? "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };

/**
 * Ends all Kontext sessions of a user; their Stalwart tokens go with them (cascade). With Dokumente
 * its sessions end too, as Schreibzeug never asks Kontext again once someone is signed in there.
 */
const endSessionsOf = (db: Db, documents: Schreibzeug | null) => async (email: string) => {
  const [found] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (!found) return;
  await db.delete(schema.session).where(eq(schema.session.userId, found.id));
  const person = { id: found.id, email: found.email, name: found.name };
  await documents
    ?.endSessions(person)
    .catch((error: Error) => console.warn(`Dokumente: Abmelden von ${email}: ${error.message}`));
};

/** Schreibzeug's API for the server, with tokens signed by Kontext's keys for its address. */
const createSchreibzeugOf = (env: Env, auth: Auth, client: SchreibzeugClient): Schreibzeug => {
  const schreibzeug = createSchreibzeug({
    url: client.url,
    issuer: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/api/auth`,
    sign: async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
  });
  // Only a note: Schreibzeug may start after Kontext.
  void schreibzeug.reachable().then((reachable) => {
    if (!reachable) console.warn(`Schreibzeug antwortet nicht: ${client.url}`);
  });
  return schreibzeug;
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
  const auth = createAuth(env, db, grants, createNameOf(env));
  const schreibzeug = schreibzeugClientOf(env);
  if (schreibzeug) await registerClient(db, schreibzeug);
  const documents = schreibzeug && createSchreibzeugOf(env, auth, schreibzeug);
  let mailboxFolders: MailboxFolders | null = null;
  const proxy = createJmapProxy(env, auth, grants);

  const categories = createCategoryStore(db);
  const app = new Hono();
  // The app's policy on its pages, also without Caddy in front (headers.ts).
  const policy = appPolicy({ schreibzeug: env.SCHREIBZEUG_URL, livekit: env.LIVEKIT_PUBLIC_URL });
  app.use(async (c, next) => {
    await next();
    withAppHeaders(c.res.headers, policy);
  });
  // Changes with the session cookie only from Kontext's own pages (csrf.ts).
  const appOrigin = new URL(env.BETTER_AUTH_URL).origin;
  app.use(async (c, next) => {
    if (!fromOwnPage(c.req.raw, appOrigin)) {
      return c.json({ error: "Anfrage von einer fremden Seite abgelehnt" }, 403);
    }
    await next();
  });

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
  // Which Kontext runs here (package.json, raised by the release); the settings set it beside the
  // app the device has loaded, which the service worker may still hold from before an update.
  // Open like /healthz: the app's public files carry the version too, and their hashed names tell
  // one release from the next, so hiding it here would hide nothing.
  app.get("/api/version", (c) => c.json({ version: packageVersion }));
  if (schreibzeug) {
    // Better Auth keeps discovery server-only; Schreibzeug reads it here (issuer + well-known path).
    const discovery = oauthProviderOpenIdConfigMetadata(auth);
    app.get("/api/auth/.well-known/openid-configuration", (c) => discovery(c.req.raw));
  }
  // Signing out of Kontext signs out of Dokumente too, also when its frame was not open since the
  // last reload (the frame's own "logout" reaches only an open one): Schreibzeug never asks Kontext
  // again once someone is signed in there, and the next person at this browser would be them.
  if (documents) {
    app.post("/api/auth/sign-out", async (c) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session) {
        const { id, email, name } = session.user;
        await documents
          .endSessions({ id, email, name })
          .catch((error: Error) =>
            console.warn(`Dokumente: Abmelden von ${email}: ${error.message}`),
          );
      }
      return auth.handler(c.req.raw);
    });
  }
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
    const management = createManagement(request);
    const mailstore = createMailstore(
      request,
      upload,
      createDownload(env.STALWART_URL, env.STALWART_ADMIN_KEY),
    );
    // Each shared mailbox gets its own folder in Dokumente, shared with its people.
    const companyMailboxes = createCompanyMailboxes({ management, mailstore });
    if (documents) {
      mailboxFolders = createMailboxFolders({
        schreibzeug: documents,
        load: companyMailboxes.load,
        ids: createFolderIds(db),
      });
    }
    const company = createCompanyRoutes({
      categories,
      management,
      mailstore,
      calendars: createCalendars(request),
      mailboxChanged: (mailboxId) => {
        companyMailboxes.forget();
        void mailboxFolders
          ?.changed(mailboxId)
          .catch((error: Error) => console.warn(`Dokumente: ${error.message}`));
      },
      settings,
      migrations: { jobs, runner, workDir },
      syncs: { syncs, runner: syncRunner, sealer: syncSealer, allowPlain, microsoft },
      currentEmail: async (request) =>
        (await auth.api.getSession({ headers: request.headers }))?.user.email ?? null,
      endSessions: endSessionsOf(db, documents),
      chatRetention,
      pruneChat: chatPruner.tick,
      security: { publicUrl: env.BETTER_AUTH_URL, resolve: dohResolver(env.DOH_URL) },
      backup: createBackupControl(join(dirname(env.DATABASE_PATH), "backup-control")),
    });
    app.route("/api/company", company);
  }
  const { accountsOf, infoOf, sendersOf } = createSessionInfo(env, auth, grants);
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
  const tasks = createTaskStore(db);
  const snoozes = createSnoozeStore(db);
  /** A board got tasks the server made (telephony, CalDAV, rules): tell who sees it. */
  const tasksChanged = (accountId: string) =>
    hub.publish({ type: "tasks", accountId }, (viewer) => viewer.accountIds.includes(accountId));
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
      dir: join(dirname(env.DATABASE_PATH), "phone"),
      importMessage: createServerJmap({
        env,
        grants,
        sessions: async () => (await snoozes.sessionsFor("")).map(({ sessionId }) => sessionId),
      }).importMessage,
      tasks: {
        create: async (task) => {
          const made = await tasks.create(task, task.accountId);
          tasksChanged(task.accountId);
          return made;
        },
        complete: async (id) => {
          const done = await tasks.update(id, { status: "done" }, "phone");
          if (done) tasksChanged(done.accountId);
        },
      },
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
  const reminder = createTaskReminder({ store: tasks, notify: pusher.notify });
  setInterval(() => void reminder.tick(), env.REMINDER_TICK_MS).unref();
  const taskNotices = {
    store: tasks,
    notify: pusher.notify,
    changed: (accountId: string, assignees: string[]) =>
      hub.publish(
        { type: "tasks", accountId },
        (viewer) => viewer.accountIds.includes(accountId) || assignees.includes(viewer.me),
      ),
  };
  app.route(
    "/api/tasks",
    createTaskRoutes({
      ...taskNotices,
      accountsOf,
      nameOf: async (request) => (await infoOf(request))?.name ?? "",
    }),
  );
  app.route(
    "/api/documents",
    createDocumentsRoutes({
      url: env.SCHREIBZEUG_URL?.replace(/\/+$/, "") ?? null,
      schreibzeug: documents,
      mailboxes: mailboxFolders,
      askerOf: async (request) => {
        const session = await auth.api.getSession({ headers: request.headers });
        const stalwartToken = session && (await grants.accessToken(session.session.id));
        if (!session || !stalwartToken) return null;
        const { id, email, name } = session.user;
        return { person: { id, email, name }, stalwartToken };
      },
      blobs: createSessionBlobs(env.STALWART_URL),
    }),
  );
  // Agents over MCP, with connections of their own; they reach what their owner may reach.
  const connections = createConnections(db);
  const revokeClient = createRevokeClient(db);
  const oauthCaller = createOAuthCaller({
    connections,
    revokeClient,
    // The server's own signing keys, read on the inside rather than through the public address.
    verify: jwtVerifier(env.BETTER_AUTH_URL, `http://127.0.0.1:${env.PORT}/api/auth/jwks`),
  });
  // Guessing a password through an agent's sign-in counts like signing in (SIGN_IN_PER_MINUTE).
  const passwordAttempts = createAttempts(env.SIGN_IN_PER_MINUTE);
  const mcp: McpDeps = {
    connections,
    grants,
    stalwartUrl: env.STALWART_URL,
    version: packageVersion,
    userOf: async (request) =>
      (await auth.api.getSession({ headers: request.headers }))?.user ?? null,
    login: (credentials) => loginAtStalwart(env.STALWART_URL, credentials),
    // The same task routes, as the agent's owner: the same rights, notices and live updates.
    tasksFor: (accounts, name) =>
      taskApiOf(createTaskRoutes({ ...taskNotices, accountsOf: accounts, nameOf: name })),
    oauthCaller: (request) => oauthCaller(request),
    revokeClient,
    mayTryPassword: passwordAttempts,
  };
  app.route("/api/mcp-keys", createMcpKeyRoutes(mcp));
  app.route(
    "/api/mcp-oauth",
    createConsentRoutes({
      ...mcp,
      revokeClient,
      api: {
        // As a request of its own: the provider continues the authorization from it.
        consent: async (body, headers) => {
          const response = await auth.handler(
            new Request(`${env.BETTER_AUTH_URL}/api/auth/oauth2/consent`, {
              method: "POST",
              headers: {
                cookie: headers.get("cookie") ?? "",
                origin: new URL(env.BETTER_AUTH_URL).origin,
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify(body),
            }),
          );
          if (!response.ok) throw new Error(`Zustimmung: ${response.status}`);
          return (await response.json()) as { url: string };
        },
        clientName: async (clientId, headers) =>
          (await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers }))
            .client_name ?? null,
      },
    }),
  );
  // OAuth discovery for agents (RFC 9728, RFC 8414) lives at the root; Better Auth answers it.
  app.on(
    ["GET", "HEAD"],
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/*",
      "/.well-known/oauth-authorization-server/*",
    ],
    (c) => auth.handler(c.req.raw),
  );
  const mcpEndpoint = createMcpEndpoint(mcp);
  app.all("/mcp", (c) => mcpEndpoint(c.req.raw));
  app.route("/api/snippets", createSnippetRoutes({ store: createSnippetStore(db), accountsOf }));
  // Wiedervorlage: due mails come back every minute, also with nobody signed in.
  const waker = createSnoozeWaker({ env, grants, store: snoozes, notify: pusher.notify });
  setInterval(() => void waker.tick(), env.SNOOZE_TICK_MS).unref();
  app.route("/api/snoozes", createSnoozeRoutes({ store: snoozes, infoOf }));
  app.route("/api/unsubscribe", createUnsubscribeRoutes({ env, grants, infoOf }));
  app.route("/api/image-senders", createImageSenderRoutes({ db, accountsOf }));
  // Place suggestions for an appointment's "Ort", from Photon through the server (places/routes.ts).
  app.route(
    "/api/places",
    createPlaceRoutes({
      url: env.PLACES_URL,
      userAgent: `Kontext/${packageVersion} (+https://github.com/firsttris/kontext)`,
      accountsOf,
    }),
  );
  app.route(
    "/api/photos",
    createPhotoRoutes({
      store: createPhotoStore(join(dirname(env.DATABASE_PATH), "photos")),
      accountsOf,
    }),
  );
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
  app.route("/api/secure", createSecureRoutes({ store: secure, accountsOf, sendersOf }));
  app.route(
    "/api/secure-public",
    createSecurePublicRoutes({ store: secure, notify: pusher.notify }),
  );
  // Invitations Kontext sends itself: signed answer links, and the page that enters the answer
  // with the server's key (without it, invitations go out without the buttons).
  const rsvpTokens = await createRsvpTokens(env.BETTER_AUTH_SECRET);
  app.route(
    "/api/invitations",
    createInvitationRoutes({
      tokens: rsvpTokens,
      publicUrl: env.BETTER_AUTH_URL,
      infoOf,
      sendersOf,
      jmapFor: createUserJmap(env, grants),
      enabled: Boolean(env.STALWART_ADMIN_KEY),
    }),
  );
  if (env.STALWART_ADMIN_KEY) {
    app.route(
      "/api/rsvp",
      createRsvpRoutes({
        tokens: rsvpTokens,
        rsvp: createRsvp(createRequest(env.STALWART_URL, env.STALWART_ADMIN_KEY)),
        mayTry: createAttempts(env.SIGN_IN_PER_MINUTE),
      }),
    );
  }
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
      changed: tasksChanged,
    }),
  );
  // Mails a rule marked "Aufgabe anlegen" become tasks, every minute, also with nobody signed in.
  const ruleTasks = createRuleTasks({
    env,
    grants,
    sessions: async () => (await snoozes.sessionsFor("")).map(({ sessionId }) => sessionId),
    store: tasks,
    changed: tasksChanged,
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
    // `precompressed`: the .br or .gz made at build time (dev/precompress.ts), as the browser
    // accepts; Caddy passes an encoded answer on as it is.
    app.use(
      "/assets/*",
      serveStatic({
        root,
        precompressed: true,
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
        precompressed: true,
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
        precompressed: true,
        onFound: (_path, c) => c.header("cache-control", "no-cache"),
      }),
    );
  }
  return { app, auth, db };
};
