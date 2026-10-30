/**
 * Signing in at Stalwart with its OAuth endpoints, without a browser redirect: the server sends
 * the credentials with the authorization request to /api/auth (authorization code with PKCE) and
 * swaps the code from the redirect it gets back at /auth/token. Source:
 * crates/http/src/auth/oauth/auth.rs (LoginRequest, LoginResponse), authorize.rs
 * (validate_authorization) and token.rs in stalwartlabs/stalwart v1.0.1.
 *
 * Stalwart 1.0 only takes clients it knows (crates/common/src/auth/oauth/client.rs,
 * resolve_oauth_client): Kontext is registered there as the first-party OAuth client `kontext`
 * with this redirect URI (docs/installation.md, dev/stalwart.ts). The person signs in in Kontext,
 * so the consent Stalwart asks every registered client for is given with the request.
 */
import { z } from "zod";

/** Stalwart only needs the redirect URI to be registered and to match; nothing is opened. */
export const CLIENT_ID = "kontext";
export const REDIRECT_URI = "https://kontext.invalid/oauth";

export type StalwartTokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date };

export type LoginResult =
  | { status: "ok"; tokens: StalwartTokens }
  | { status: "mfa" }
  | { status: "failed" }
  /** Stalwart did not answer as it should: no verdict on the password. */
  | { status: "unavailable" };

const loginResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("authenticated"), location: z.string() }),
  z.object({ type: z.literal("mfaRequired") }),
  z.object({ type: z.literal("failure") }),
  /** The password has expired (Stalwart refuses it to clients that are not first-party). */
  z.object({ type: z.literal("expired") }),
  /** The authorization request itself was refused, e.g. Kontext is not registered as a client. */
  z.object({ type: z.literal("invalid"), description: z.string() }),
  /** Refused after the client was known, as an error on the redirect (authorize.rs). */
  z.object({ type: z.literal("redirect"), location: z.string() }),
]);

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

const base64url = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

const pkce = async () => {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
};

const toTokens = (
  body: z.infer<typeof tokenResponse>,
  previousRefresh?: string,
): StalwartTokens => {
  const refreshToken = body.refresh_token ?? previousRefresh;
  if (!refreshToken) throw new Error("Stalwart hat keinen Refresh-Token geliefert");
  return {
    accessToken: body.access_token,
    refreshToken,
    // A minute early, so a token never runs out in the middle of a request.
    accessExpiresAt: new Date(Date.now() + (body.expires_in - 60) * 1000),
  };
};

/** Stalwart's answer at /auth/token: tokens, a token it refuses, or no answer to go by. */
type TokenAnswer =
  | { status: "ok"; body: z.infer<typeof tokenResponse> }
  | { status: "rejected" }
  | { status: "unavailable" };

const postToken = async (
  stalwartUrl: string,
  form: Record<string, string>,
): Promise<TokenAnswer> => {
  const response = await fetch(`${stalwartUrl}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  }).catch(() => null);
  if (!response) return { status: "unavailable" };
  if (response.ok) return { status: "ok", body: tokenResponse.parse(await response.json()) };
  // RFC 6749 5.2: an invalid grant is a 400 (401 for the client); a ban (403), a limit (429) or
  // a server error says nothing about the token.
  return response.status === 400 || response.status === 401
    ? { status: "rejected" }
    : { status: "unavailable" };
};

/** The authorization request (RFC 6749 4.1.1, RFC 7636) Stalwart checks the sign-in against. */
const authorizationQuery = (challenge: string, state: string): string =>
  new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

/** The code from the redirect Stalwart answers with, if it is the one for this request. */
export const codeFromRedirect = (location: string, state: string): string | null => {
  const url = URL.parse(location);
  if (!url || `${url.origin}${url.pathname}` !== REDIRECT_URI) return null;
  return url.searchParams.get("state") === state ? url.searchParams.get("code") : null;
};

export const loginAtStalwart = async (
  stalwartUrl: string,
  credentials: { email: string; password: string; code?: string },
): Promise<LoginResult> => {
  const { verifier, challenge } = await pkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const response = await fetch(`${stalwartUrl}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "authCode",
      accountName: credentials.email,
      accountSecret: credentials.password,
      ...(credentials.code ? { mfaToken: credentials.code } : {}),
      query: authorizationQuery(challenge, state),
      consent: true,
    }),
  }).catch(() => null);
  // A wrong password is a 200 with type "failure" (LoginResponse in
  // crates/http/src/auth/oauth/auth.rs); an HTTP error is Stalwart not answering as it should.
  if (!response?.ok) return { status: "unavailable" };
  const login = loginResponse.safeParse(await response.json().catch(() => null));
  if (!login.success) return { status: "unavailable" };
  if (login.data.type === "mfaRequired") return { status: "mfa" };
  if (login.data.type === "failure" || login.data.type === "expired") return { status: "failed" };
  if (login.data.type === "invalid" || login.data.type === "redirect") {
    const reason =
      login.data.type === "invalid"
        ? login.data.description
        : (URL.parse(login.data.location)?.searchParams.get("error") ?? login.data.location);
    console.warn(
      `Stalwart lehnt die Anmeldung für Kontext ab (${reason}); ist der OAuth-Client "${CLIENT_ID}" angelegt? Siehe docs/installation.md.`,
    );
    return { status: "unavailable" };
  }
  const code = codeFromRedirect(login.data.location, state);
  if (!code) return { status: "unavailable" };

  const token = await postToken(stalwartUrl, {
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  if (token.status === "ok") return { status: "ok", tokens: toTokens(token.body) };
  return token.status === "rejected" ? { status: "failed" } : { status: "unavailable" };
};

export type RefreshResult =
  | { status: "ok"; tokens: StalwartTokens }
  /** The refresh token is no longer valid: sign in again. */
  | { status: "rejected" }
  /** Stalwart did not answer as it should (down, a limit, a ban): try again later. */
  | { status: "unavailable" };

/** A new access token for a refresh token. */
export const refreshAtStalwart = async (
  stalwartUrl: string,
  refreshToken: string,
): Promise<RefreshResult> => {
  const token = await postToken(stalwartUrl, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  return token.status === "ok"
    ? { status: "ok", tokens: toTokens(token.body, refreshToken) }
    : token;
};

/** Name and address of the account, from the JMAP session. */
export const whoAmI = async (
  stalwartUrl: string,
  accessToken: string,
): Promise<{ email: string }> => {
  const response = await fetch(`${stalwartUrl}/jmap/session`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`JMAP-Session: ${response.status}`);
  const session = (await response.json()) as { username: string };
  return { email: session.username };
};
