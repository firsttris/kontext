/**
 * Kontext as the sign-in provider (OpenID Connect) of Schreibzeug: who is signed in here is signed
 * in there without a second password. Better Auth's `jwt` plugin keeps the signing keys (JWKS),
 * `@better-auth/oauth-provider` answers authorize, token and userinfo under /api/auth; the issuer is
 * `<BETTER_AUTH_URL>/api/auth`, so discovery is /api/auth/.well-known/openid-configuration (Caddy
 * gives the root /.well-known to Stalwart).
 *
 * There is one client, Schreibzeug, set by the environment and written into the database at
 * start. Both services belong to the same operator, so the client skips the consent screen, and
 * nobody can register or change clients through the API.
 */
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins";
import type { Db } from "../db";
import { schema } from "../db";
import type { Env } from "../env";

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

/** The two plugins: signing keys, and the provider itself. */
export const providerPlugins = () => [
  // Sessions keep their cookie; the provider signs id tokens with these keys, nothing else does.
  jwt({ disableSettingJwtHeader: true }),
  oauthProvider({
    scopes: [...SCOPES],
    grantTypes: ["authorization_code"],
    // The login page continues the authorization after signing in (src/auth/oauth-query.ts).
    loginPage: "/login",
    // The only client skips consent; a page for it would never be shown.
    consentPage: "/login",
    storeClientSecret: { hash: hashSecret },
    // No client is created, changed or listed through the API: the environment decides.
    clientPrivileges: () => false,
  }),
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
