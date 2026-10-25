/**
 * Kontext as the OAuth 2.1 authorization server for agents (MCP authorization, RFC 9728 / 8414 /
 * 8707): Claude's apps and other MCP clients sign in in the browser instead of copying a key.
 * The provider itself is the one of server/oidc/provider.ts (Better Auth's MCP plugin, which is
 * its OAuth provider with the MCP resource); this file brings what agents need: tokens are JWTs
 * bound to `<public URL>/mcp`, clients register by a Client ID Metadata Document
 * (@better-auth/cimd) or dynamically (RFC 7591), and /mcp checks the tokens.
 *
 * The consent page (src/routes/agent-consent.tsx) asks for the password again: like an access key,
 * each OAuth connection signs in at Stalwart on its own (server/mcp/connections.ts), so the agent
 * reaches what its owner may reach and revoking it ends exactly that.
 */
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { and, eq } from "drizzle-orm";
import type { JWTPayload } from "jose";
import type { Db } from "../db";
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "../db/oauth-schema";
import type { Connections, McpCaller } from "./connections";
import { parseScopes } from "./connections";

/** The rights an agent may ask for (with OpenID's identity scopes and offline_access). */
export const AGENT_SCOPES = ["read", "write"] as const;

export const CONSENT_PAGE = "/agent-consent";

export const mcpResource = (publicUrl: string): string => `${publicUrl.replace(/\/$/, "")}/mcp`;

/**
 * What the one OAuth provider (server/oidc/provider.ts) needs for agents: the MCP resource, the
 * consent page with the password, and registration by anyone – a client gets nothing before a
 * person allowed it there.
 */
export const agentProviderOptions = (publicUrl: string) => ({
  resource: mcpResource(publicUrl),
  consentPage: CONSENT_PAGE,
  // A new client may read; writing is chosen by the person on the consent page.
  clientRegistrationDefaultScopes: ["openid", "offline_access", "read"],
  clientRegistrationAllowedScopes: ["profile", "email", "write"],
  allowDynamicClientRegistration: true,
  allowUnauthenticatedClientRegistration: true,
  // Claude Code and other local agents wait on http://localhost:<port>/callback: a native app
  // (RFC 8252), told by its redirect when it does not say so itself.
  clientRegistrationDefaultApplicationType: "infer" as const,
  // An hour; the refresh token keeps the agent connected while it is used.
  accessTokenExpiresIn: 3600,
});

/** Clients that name themselves by the address of their metadata (CIMD), fetched pinned. */
export const agentClientDiscovery = () =>
  cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" });

/** The rights a connection gets: what the person allowed, as far as the token carries them. */
export const grantedScopes = (connectionScopes: string, tokenScope: unknown) => {
  const inToken = new Set(typeof tokenScope === "string" ? tokenScope.split(" ") : []);
  return parseScopes(connectionScopes).filter((scope) => scope === "read" || inToken.has(scope));
};

/** The OAuth client the token was issued to (`azp`, else `client_id`). */
export const clientOf = (claims: JWTPayload): string | null =>
  typeof claims.azp === "string"
    ? claims.azp
    : typeof claims.client_id === "string"
      ? claims.client_id
      : null;

export type OAuthCallerDeps = {
  connections: Pick<Connections, "resolveClient">;
  publicUrl: string;
  /** Where the server reads its own signing keys, without going out through the internet. */
  jwksUrl: string;
};

/**
 * The caller behind an OAuth token, or the response that tells the client to (re)authorize:
 * RFC 9728's challenge for a missing or bad token, and the same for a token whose connection
 * was revoked, so the client starts over and the person is asked again.
 */
export const createOAuthCaller = ({ connections, publicUrl, jwksUrl }: OAuthCallerDeps) => {
  const resource = mcpResource(publicUrl);
  const verify = (claimsOut: { claims?: JWTPayload }) =>
    createMcpProtectedRequestHandler(
      {
        issuer: `${publicUrl.replace(/\/$/, "")}/api/auth`,
        audience: resource,
        jwksUrl,
        jwtVerifyOptions: { requiredClaims: ["azp"] },
        challengeScopes: ["read"],
      },
      async (_request, claims) => {
        claimsOut.claims = claims;
        return new Response(null, { status: 204 });
      },
    );
  return async (request: Request): Promise<McpCaller | Response> => {
    const out: { claims?: JWTPayload } = {};
    const response = await verify(out)(request);
    if (!out.claims) return response;
    const clientId = clientOf(out.claims);
    const found =
      out.claims.sub && clientId ? await connections.resolveClient(out.claims.sub, clientId) : null;
    if (!found) {
      // Like a missing token: the client asks the person again.
      const fresh = new Request(request.url, { method: request.method });
      return verify({})(fresh);
    }
    return { ...found, scopes: grantedScopes(found.scopes.join(" "), out.claims.scope) };
  };
};

/**
 * Takes a client's consent and tokens away from a person, so the next authorization asks them
 * again and no refresh token outlives the connection. Access tokens are JWTs and are not looked
 * up; /mcp refuses them anyway once the connection is gone.
 */
export const createRevokeClient = (db: Db) => async (userId: string, clientId: string) => {
  for (const table of [oauthAccessToken, oauthRefreshToken, oauthConsent]) {
    await db.delete(table).where(and(eq(table.userId, userId), eq(table.clientId, clientId)));
  }
};
