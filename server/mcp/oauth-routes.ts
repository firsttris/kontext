/**
 * /api/mcp-oauth/consent: the consent page's answer for an agent that signs in over OAuth
 * (src/routes/agent-consent.tsx). Allowing asks for the password (and code) again, then lets Better
 * Auth's provider finish the authorization (it checks the signed request), and only then makes
 * the connection with its own Stalwart sign-in – as for an access key (server/mcp/routes.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Grants } from "../auth";
import type { LoginResult } from "../stalwart";
import type { Connections } from "./connections";
import { scopesFor } from "./routes";

export type ConsentApi = {
  /** Better Auth's /oauth2/consent for the signed-in person: where the browser goes next. */
  consent: (
    body: { accept: boolean; scope?: string; oauth_query: string },
    headers: Headers,
  ) => Promise<{ url: string }>;
  /** The client's name as it registered, for the list of connections. */
  clientName: (clientId: string, headers: Headers) => Promise<string | null>;
};

export type ConsentDeps = {
  api: ConsentApi;
  connections: Pick<Connections, "openSession" | "dropSession" | "createOAuth">;
  grants: Pick<Grants, "save">;
  userOf: (request: Request) => Promise<{ id: string; email: string } | null>;
  login: (credentials: { email: string; password: string; code?: string }) => Promise<LoginResult>;
  /** Whether this person may try a password once more now (server/mcp/attempts.ts). */
  mayTryPassword: (userId: string) => boolean;
  /** Takes the consent back when the connection could not be made after it. */
  revokeClient: (userId: string, clientId: string) => Promise<void>;
};

const consentSchema = z.object({
  oauth_query: z.string().min(1).max(8192),
  accept: z.boolean(),
  write: z.boolean().default(false),
  password: z.string().max(1024).optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/)
    .optional(),
});

/** The scopes to grant: what was asked for, without "write" unless the person allowed it. */
export const acceptedScopes = (requested: string | null, write: boolean): string =>
  (requested ?? "")
    .split(" ")
    .filter((scope) => scope && (scope !== "write" || write))
    .join(" ");

export const createConsentRoutes = ({
  api,
  connections,
  grants,
  userOf,
  login,
  mayTryPassword,
  revokeClient,
}: ConsentDeps) => {
  const app = new Hono();

  app.post("/consent", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = consentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Anfrage unvollständig." }, 400);
    const { oauth_query, accept, write, password, code } = parsed.data;
    const headers = c.req.raw.headers;
    const query = new URLSearchParams(oauth_query);
    const clientId = query.get("client_id");
    if (!clientId) return c.json({ error: "Anfrage unvollständig." }, 400);

    if (!accept) return c.json(await api.consent({ accept: false, oauth_query }, headers));

    if (!password) return c.json({ error: "Passwort fehlt." }, 400);
    if (!mayTryPassword(user.id)) {
      return c.json({ error: "Zu viele Versuche – bitte in einer Minute noch einmal." }, 429);
    }
    const result = await login({ email: user.email, password, code });
    if (result.status === "mfa") return c.json({ status: "mfa" as const });
    if (result.status === "failed") return c.json({ error: "Passwort oder Code falsch." }, 401);
    if (result.status === "unavailable") {
      return c.json({ error: "Der Mailserver antwortet gerade nicht." }, 503);
    }

    const scope = acceptedScopes(query.get("scope"), write);
    const next = await api.consent({ accept: true, scope, oauth_query }, headers).catch(() => null);
    if (!next)
      return c.json({ error: "Die Anfrage ist abgelaufen – bitte im Agenten neu verbinden." }, 400);

    // The consent stands now; without its connection it must go again, or the agent would get
    // codes without the person being asked (server/mcp/oauth.ts).
    const name = (await api.clientName(clientId, headers).catch(() => null)) || clientId;
    const sessionId = await connections.openSession(user.id, name).catch(async (error) => {
      await revokeClient(user.id, clientId);
      throw error;
    });
    try {
      await grants.save(sessionId, result.tokens);
      await connections.createOAuth(user.id, sessionId, name, clientId, scopesFor(write));
    } catch (error) {
      await connections.dropSession(sessionId);
      await revokeClient(user.id, clientId);
      throw error;
    }
    return c.json({ url: next.url });
  });

  return app;
};
