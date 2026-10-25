/**
 * A stand-in for Schreibzeug (firsttris/schreibzeug), just enough for the module "Dokumente" in
 * development and tests, without its editing engine:
 *
 * - its sign-in through Kontext: the OpenID Connect code flow with PKCE against Kontext's provider
 *   (silently, `prompt=none`), the id token checked against Kontext's keys;
 * - its side of the frame: the messages it sends and takes (Schreibzeug's apps/web/src/embed);
 * - its API for Kontext's server: a folder listing, uploads and downloads with a bearer token
 *   from Kontext, checked against Kontext's keys, issuer and this address as audience.
 *
 *   bun dev/fake-schreibzeug.ts                                        # http://localhost:18096
 *   bun dev/fake-schreibzeug.ts --port 28096 --kontext http://localhost:5174   # the e2e tests
 *
 * Kontext then needs SCHREIBZEUG_URL=http://localhost:<port> and SCHREIBZEUG_CLIENT_SECRET set to
 * SCHREIBZEUG_DEV_SECRET (dev/config.ts), the secret this stand-in signs in with.
 */
import { parseArgs } from "node:util";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SCHREIBZEUG_DEV_SECRET } from "./config";

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: "18096" },
    kontext: { type: "string", default: "http://localhost:5173" },
    secret: { type: "string", default: SCHREIBZEUG_DEV_SECRET },
  },
});
const self = `http://localhost:${args.port}`;
const kontext = args.kontext;
const issuer = `${kontext}/api/auth`;
const keys = createRemoteJWKSet(new URL(`${issuer}/jwks`));
const callback = `${self}/api/auth/callback/oidc`;
const CLIENT_ID = "schreibzeug";

type Person = { sub: string; email: string; name: string };
const sessions = new Map<string, Person>();
const pending = new Map<string, { verifier: string; path: string }>();
/** Files by id, each with its owner's address (what Kontext's tokens name) and who it is shared with. */
const files = new Map<string, { owner: string; file: File; sharedWith: Map<string, string> }>();

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes as Uint8Array).toString("base64url");
const challengeOf = async (verifier: string) =>
  base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));

const sessionOf = (request: Request) => {
  const id = request.headers.get("cookie")?.match(/fake_schreibzeug=([^;]+)/)?.[1];
  return id ? (sessions.get(id) ?? null) : null;
};

const redirect = (to: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { location: to, ...headers } });

/** To Kontext's provider, without asking anything: back with a code, or with login_required. */
const signIn = async (path: string) => {
  const state = crypto.randomUUID();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  pending.set(state, { verifier, path });
  const url = new URL(`${issuer}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: callback,
    scope: "openid profile email",
    state,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
    prompt: "none",
  }).toString();
  return redirect(url.toString());
};

const finishSignIn = async (url: URL) => {
  const state = url.searchParams.get("state") ?? "";
  const started = pending.get(state);
  pending.delete(state);
  const code = url.searchParams.get("code");
  if (!started || !code) return page(null, `/error ${url.searchParams.get("error") ?? "state"}`);
  const reply = await fetch(`${issuer}/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${CLIENT_ID}:${args.secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callback,
      code_verifier: started.verifier,
    }),
  });
  if (!reply.ok) return page(null, `/error token ${reply.status} ${await reply.text()}`);
  const { id_token, access_token } = (await reply.json()) as {
    id_token: string;
    access_token: string;
  };
  const { payload } = await jwtVerify(id_token, keys, { issuer, audience: CLIENT_ID });
  // Name and address come from UserInfo, as Better Auth's generic OAuth plugin reads them.
  const info = (await (
    await fetch(`${issuer}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${access_token}` },
    })
  ).json()) as Person;
  if (info.sub !== payload.sub) return page(null, "/error subject");
  const id = crypto.randomUUID();
  sessions.set(id, { sub: info.sub, email: info.email, name: info.name });
  return redirect(started.path, { "set-cookie": `fake_schreibzeug=${id}; Path=/; SameSite=Lax` });
};

/** The person a bearer token from Kontext's server names, or null. */
const bearerOf = async (request: Request): Promise<Person | null> => {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  const verified = await jwtVerify<Person>(token, keys, { issuer, audience: self }).catch(
    () => null,
  );
  return verified
    ? { sub: verified.payload.sub, email: verified.payload.email, name: verified.payload.name }
    : null;
};

const node = (id: string, file: File) => ({
  id,
  kind: "file" as const,
  name: file.name,
  size: file.size,
});

const api = async (request: Request, url: URL) => {
  if (url.pathname === "/api/health") return Response.json({ ok: true });
  const person = await bearerOf(request);
  if (!person)
    return Response.json(
      { error: { kind: "unauthorized", message: "Bitte melde dich an." } },
      { status: 401 },
    );
  const own = [...files.entries()].filter(([, file]) => file.owner === person.email);
  if (request.method === "GET" && url.pathname === "/api/nodes")
    return Response.json({
      folder: null,
      path: [],
      children: own.map(([id, stored]) => node(id, stored.file)),
    });
  if (request.method === "POST" && url.pathname === "/api/files") {
    const upload = (await request.formData()).get("file") as File;
    if (own.some(([, stored]) => stored.file.name === upload.name))
      return Response.json(
        {
          error: {
            kind: "name_taken",
            message: "In diesem Ordner gibt es schon etwas mit diesem Namen.",
          },
        },
        { status: 409 },
      );
    const id = crypto.randomUUID();
    files.set(id, { owner: person.email, file: upload, sharedWith: new Map() });
    return Response.json(node(id, upload), { status: 201 });
  }
  const id = url.pathname.match(/^\/api\/(?:nodes|files)\/([^/]+)/)?.[1] ?? "";
  const stored = files.get(id);
  if (!stored || stored.owner !== person.email)
    return Response.json({ error: { kind: "not_found" } }, { status: 404 });
  if (request.method === "PUT" && url.pathname.endsWith("/shares")) {
    const { email, role } = (await request.json()) as { email: string; role: string };
    stored.sharedWith.set(email, role);
    return Response.json(
      [...stored.sharedWith].map(([address, given]) => ({ email: address, role: given })),
    );
  }
  if (url.pathname.endsWith("/content"))
    return new Response(stored.file, { headers: { "content-type": stored.file.type } });
  return Response.json(node(id, stored.file));
};

/**
 * For the tests only: a file of someone's (`POST /e2e/files` with `{ owner, name }`), and whom a
 * file was shared with (`GET /e2e/shares/<id>`).
 */
const e2e = async (request: Request, url: URL) => {
  if (request.method === "POST" && url.pathname === "/e2e/files") {
    const { owner, name } = (await request.json()) as { owner: string; name: string };
    const id = crypto.randomUUID();
    const file = new File(["Inhalt"], name, { type: "application/octet-stream" });
    files.set(id, { owner: owner.toLowerCase(), file, sharedWith: new Map() });
    return Response.json(node(id, file), { status: 201 });
  }
  const shared = files.get(url.pathname.replace("/e2e/shares/", ""));
  return Response.json(shared ? Object.fromEntries(shared.sharedWith) : null);
};

/** Schreibzeug's side of the frame: who is signed in, the page, and its messages to Kontext. */
const page = (person: Person | null, path: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Schreibzeug</title>
<p id="who">${person ? `Angemeldet als ${person.name}` : "Nicht angemeldet"}</p>
<p id="path">${path}</p>
<p id="loaded">${crypto.randomUUID()}</p>
<a href="/recent" id="recent">Zuletzt</a>
<button id="change">Ändern</button><button id="save">Speichern</button>
<script>
  const kontext = ${JSON.stringify(new URL(kontext).origin)};
  const post = (message) => parent.postMessage({ source: "schreibzeug", ...message }, kontext);
  const show = (path) => {
    document.getElementById("path").textContent = path;
    post({ type: "route", path });
    post({ type: "title", title: path.startsWith("/edit/") ? "Angebot.docx" : null });
  };
  document.getElementById("recent").addEventListener("click", (event) => {
    event.preventDefault();
    history.pushState(null, "", "/recent");
    show("/recent");
  });
  document.getElementById("change").addEventListener("click", () => post({ type: "unsaved", unsaved: true }));
  document.getElementById("save").addEventListener("click", () => post({ type: "unsaved", unsaved: false }));
  addEventListener("popstate", () => show(location.pathname));
  addEventListener("message", (event) => {
    if (event.origin !== kontext || event.source !== parent) return;
    const message = event.data;
    if (message.type === "theme") document.documentElement.dataset.theme = message.theme;
    if (message.type === "navigate") { history.pushState(null, "", message.path); show(message.path); }
    if (message.type === "logout")
      fetch("/logout", { method: "POST" }).then(() => post({ type: "signed-out" }));
  });
  post({ type: "ready" });
  show(${JSON.stringify(path)});
</script>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const server = Bun.serve({
  port: Number(args.port),
  fetch: async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/callback/oidc")) return finishSignIn(url);
    if (url.pathname.startsWith("/e2e/")) return e2e(request, url);
    if (url.pathname.startsWith("/api/")) return api(request, url);
    if (request.method === "POST" && url.pathname === "/logout") {
      const id = request.headers.get("cookie")?.match(/fake_schreibzeug=([^;]+)/)?.[1];
      if (id) sessions.delete(id);
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": "fake_schreibzeug=; Path=/; Max-Age=0" },
      });
    }
    const person = sessionOf(request);
    return person ? page(person, url.pathname) : signIn(url.pathname);
  },
});
console.log(`Fake Schreibzeug läuft: ${server.url}`);
