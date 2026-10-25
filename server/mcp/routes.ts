/**
 * Agents over MCP: /mcp answers with the tools for the bearer of an access key (or an OAuth
 * token, server/mcp/oauth.ts), /api/mcp-keys lets the signed-in person list their connections,
 * make keys and revoke either. Making a key asks for the password (and the two-factor code)
 * again: the key gets its own Stalwart sign-in, so revoking it ends exactly that access.
 */
import { Hono } from "hono";
import { z } from "zod";
import { createJmapClient } from "@/jmap/client";
import { listIdentities } from "@/jmap/mail";
import type { Grants } from "../auth";
import type { SessionAccount } from "../categories/routes";
import type { LoginResult } from "../stalwart";
import {
  bearerToken,
  type Connections,
  isAccessKey,
  type McpCaller,
  type Scope,
} from "./connections";
import { accountsOf, createReader } from "./reader";
import { handleMcp } from "./server";
import { createWriter, type TaskApi } from "./writer";

const HOUR = 3_600_000;

export type McpDeps = {
  connections: Connections;
  grants: Pick<Grants, "accessToken" | "save">;
  stalwartUrl: string;
  version: string;
  /** The signed-in person (cookie session), or null. */
  userOf: (request: Request) => Promise<{ id: string; email: string } | null>;
  login: (credentials: { email: string; password: string; code?: string }) => Promise<LoginResult>;
  /** Whether this person may try a password once more now (server/mcp/attempts.ts). */
  mayTryPassword: (userId: string) => boolean;
  /** The task routes as someone with these accounts and this name (for notices). */
  tasksFor: (accounts: () => Promise<SessionAccount[]>, name: () => Promise<string>) => TaskApi;
  /** The caller behind a bearer token that is no access key (OAuth), or null. */
  oauthCaller?: (request: Request, token: string | null) => Promise<McpCaller | Response | null>;
  /** Takes an OAuth client's consent and tokens away (a revoked or expired connection). */
  revokeClient?: (userId: string, clientId: string) => Promise<void>;
  /** How many changes one connection may make per hour. */
  writesPerHour?: number;
  fetch?: typeof fetch;
};

const newKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(1024),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/)
    .optional(),
  write: z.boolean().default(false),
});

/** RFC 6750 §3: a client without (valid) credentials learns how to authenticate. */
const unauthorized = (message: string) =>
  Response.json(
    { error: message },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="kontext"' } },
  );

/** A JMAP client that talks to Stalwart directly with this token. */
const clientWith = (stalwartUrl: string, token: string, base: typeof fetch) =>
  createJmapClient({
    origin: stalwartUrl,
    fetch: ((input: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      return base(input, { ...init, headers });
    }) as typeof fetch,
  });

export const scopesFor = (write: boolean): Scope[] => (write ? ["read", "write"] : ["read"]);

export const createMcpEndpoint = (deps: McpDeps) => {
  const { connections, grants, stalwartUrl, version, tasksFor, fetch: base = fetch } = deps;
  const writesPerHour = deps.writesPerHour ?? 100;

  /** An access key, else (with OAuth) a token or the challenge that starts signing in. */
  const callerOf = async (request: Request): Promise<McpCaller | Response> => {
    const token = bearerToken(request.headers.get("authorization"));
    if (token && isAccessKey(token)) {
      return (
        (await connections.resolveKey(token)) ??
        unauthorized("Zugangsschlüssel unbekannt oder widerrufen")
      );
    }
    const oauth = deps.oauthCaller ? await deps.oauthCaller(request, token) : null;
    return (
      oauth ?? unauthorized(token ? "Zugang unbekannt oder widerrufen" : "Zugangsschlüssel fehlt")
    );
  };
  const expired = () => unauthorized("Zugang abgelaufen – bitte den Agenten neu verbinden");
  const orChallenge = (found: McpCaller | Response | null) =>
    found instanceof Response ? found : expired();

  return async (request: Request): Promise<Response> => {
    const caller = await callerOf(request);
    if (caller instanceof Response) return caller;
    const token = await grants.accessToken(caller.sessionId);
    if (!token) {
      // An OAuth connection is forgotten, consent included, so the agent's next try asks again.
      if (caller.clientId && deps.oauthCaller) {
        await connections.remove(caller.userId, caller.connectionId);
        await deps.revokeClient?.(caller.userId, caller.clientId);
        return orChallenge(await deps.oauthCaller(new Request(request.url), null));
      }
      return expired();
    }
    const client = clientWith(stalwartUrl, token, base);
    const sessionAccounts = async (): Promise<SessionAccount[]> =>
      accountsOf(await client.getSession()).map((account) => ({
        id: account.id,
        name: account.name,
        isPersonal: account.personal,
        isReadOnly: account.readOnly,
      }));
    const name = async () => {
      const own = (await sessionAccounts()).find((account) => account.isPersonal);
      const identities = own ? await listIdentities(client, own.id) : [];
      return identities[0]?.name || caller.email;
    };
    const taskApi = tasksFor(sessionAccounts, name);
    const reader = createReader({ client, taskApi });
    const writer = createWriter({ client, reader, taskApi });
    return handleMcp(request, {
      context: { reader, writer },
      scopes: caller.scopes,
      version,
      guard: {
        mayWrite: async () =>
          (await connections.writesSince(caller.connectionId, new Date(Date.now() - HOUR))) <
          writesPerHour,
        log: (tool, summary) => connections.log(caller.connectionId, tool, summary),
      },
    });
  };
};

export const createMcpKeyRoutes = (deps: McpDeps) => {
  const { connections, grants, userOf, login, mayTryPassword } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json({ connections: await connections.list(user.id) });
  });

  app.post("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Name und Passwort fehlen." }, 400);
    const { name, password, code, write } = parsed.data;
    if (!mayTryPassword(user.id)) {
      return c.json({ error: "Zu viele Versuche – bitte in einer Minute noch einmal." }, 429);
    }
    const result = await login({ email: user.email, password, code });
    if (result.status === "mfa") return c.json({ status: "mfa" as const });
    if (result.status === "failed") return c.json({ error: "Passwort oder Code falsch." }, 401);
    const sessionId = await connections.openSession(user.id, name);
    try {
      await grants.save(sessionId, result.tokens);
    } catch (error) {
      await connections.dropSession(sessionId);
      throw error;
    }
    const { key, info } = await connections.createKey(user.id, sessionId, name, scopesFor(write));
    return c.json({ status: "ok" as const, key, info });
  });

  app.delete("/:id", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    const removed = await connections.remove(user.id, c.req.param("id"));
    if (!removed) return c.json({ error: "Verbindung nicht gefunden" }, 404);
    // An OAuth client also loses its tokens, so it cannot just ask again silently.
    if (removed.clientId) await deps.revokeClient?.(user.id, removed.clientId);
    return c.json({ ok: true });
  });

  return app;
};
