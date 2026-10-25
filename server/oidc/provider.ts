/**
 * Kontext as a sign-in provider, one for both who use it (Better Auth allows one):
 * - Schreibzeug (OpenID Connect): who is signed in here is signed in there without a second
 *   password. One fixed client, set by the environment and written into the database at start;
 *   both services belong to the same operator, so it skips the consent screen.
 * - Agents over MCP (OAuth 2.1, server/mcp/oauth.ts): Claude and other clients register
 *   themselves and get nothing before a person allowed them on the consent page.
 *
 * Better Auth's `jwt` plugin keeps the signing keys (JWKS); `@better-auth/mcp` is
 * `@better-auth/oauth-provider` with the MCP resource and answers authorize, token and userinfo
 * under /api/auth. The issuer is `<BETTER_AUTH_URL>/api/auth`, so discovery is
 * /api/auth/.well-known/openid-configuration; the agents' discovery at the root
 * (/.well-known/oauth-*) is given to Kontext by Caddy, the rest of /.well-known to Stalwart.
 * Nobody signed in can create or change clients through the API.
 */
import { mcp } from "@better-auth/mcp";
import { jwt } from "better-auth/plugins";
import type { Db } from "../db";
import { schema } from "../db";
import type { Env } from "../env";
import { AGENT_SCOPES, agentClientDiscovery, agentProviderOptions } from "../mcp/oauth";

export type SchreibzeugClient = {
  /** Where browsers reach Schreibzeug, e.g. https://dokumente.firma.de (no trailing slash). */
  url: string;
  clientId: string;
  clientSecret: string;
};

/** The provider id Schreibzeug knows its sign-in provider by (OIDC_PROVIDER in its src/auth/auth.ts). */
const PROVIDER_ID = "oidc";

/** The scopes Schreibzeug may ask for: who the person is, nothing in their mailbox. */
const SCOPES = ["openid", "profile", "email"] as const;

/** Schreibzeug as a client, when its address and secret are set; sign-in through Kontext is off otherwise. */
export const schreibzeugClientOf = (env: Env): SchreibzeugClient | null =>
  env.SCHREIBZEUG_URL && env.SCHREIBZEUG_CLIENT_SECRET
    ? {
        url: env.SCHREIBZEUG_URL.replace(/\/+$/, ""),
        clientId: env.SCHREIBZEUG_CLIENT_ID,
        clientSecret: env.SCHREIBZEUG_CLIENT_SECRET,
      }
    : null;

/** Better Auth's OAuth callback in Schreibzeug (better-auth api/routes/callback.ts, `/callback/:id`). */
export const redirectUriOf = (client: SchreibzeugClient) =>
  `${client.url}/api/auth/callback/${PROVIDER_ID}`;

/** SHA-256, base64url without padding: how the client secret is kept in the database. */
export const hashSecret = async (secret: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Buffer.from(digest).toString("base64url");
};

/** The plugins: signing keys, the provider itself, and agents naming themselves by their metadata. */
export const providerPlugins = (publicUrl: string) => [
  // Sessions keep their cookie; the provider signs its tokens with these keys, nothing else does.
  jwt({ disableSettingJwtHeader: true }),
  mcp({
    ...agentProviderOptions(publicUrl),
    scopes: [...SCOPES, "offline_access", ...AGENT_SCOPES],
    // Always a person behind a token: no client_credentials. Schreibzeug's client has no refresh.
    grantTypes: ["authorization_code", "refresh_token"],
    // The login page continues the authorization after signing in (src/auth/oauth-query.ts).
    loginPage: "/login",
    storeClientSecret: { hash: hashSecret },
    // No client is created, changed or listed by a signed-in person: Schreibzeug comes from the
    // environment, agents register themselves (without a session).
    clientPrivileges: () => false,
  }),
  agentClientDiscovery(),
];

/** Writes Schreibzeug's client into the database, or brings it up to date with the environment. */
export const registerClient = async (db: Db, client: SchreibzeugClient) => {
  const now = new Date();
  const row = {
    clientId: client.clientId,
    clientSecret: await hashSecret(client.clientSecret),
    name: "Schreibzeug",
    uri: client.url,
    disabled: false,
    skipConsent: true,
    scopes: JSON.stringify(SCOPES),
    redirectUris: JSON.stringify([redirectUriOf(client)]),
    grantTypes: JSON.stringify(["authorization_code"]),
    responseTypes: JSON.stringify(["code"]),
    tokenEndpointAuthMethod: "client_secret_basic",
    applicationType: "web",
    requirePKCE: true,
    updatedAt: now,
  };
  await db
    .insert(schema.oauthClient)
    .values({ id: crypto.randomUUID(), createdAt: now, ...row })
    .onConflictDoUpdate({ target: schema.oauthClient.clientId, set: row });
};
