/**
 * Signing in at Stalwart with its OAuth endpoints, without a browser redirect: the server sends
 * the credentials to /api/auth (authorization code with PKCE) and swaps the code at /auth/token.
 * Source: crates/http/src/auth/oauth/auth.rs (LoginRequest) and token.rs in stalwartlabs/stalwart.
 */
import { z } from "zod";

/** Stalwart only needs the redirect URI to match between the two calls; nothing is opened. */
const CLIENT_ID = "kontext";
const REDIRECT_URI = "https://kontext.invalid/oauth";

export type StalwartTokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date };

export type LoginResult =
  | { status: "ok"; tokens: StalwartTokens }
  | { status: "mfa" }
  | { status: "failed" }
  /** Stalwart did not answer as it should: no verdict on the password. */
  | { status: "unavailable" };

const loginResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("authenticated"), client_code: z.string() }),
  z.object({ type: z.literal("mfaRequired") }),
  z.object({ type: z.literal("failure") }),
  z.object({ type: z.literal("verified") }),
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

export const loginAtStalwart = async (
  stalwartUrl: string,
  credentials: { email: string; password: string; code?: string },
): Promise<LoginResult> => {
  const { verifier, challenge } = await pkce();
  const response = await fetch(`${stalwartUrl}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "authCode",
      accountName: credentials.email,
      accountSecret: credentials.password,
      ...(credentials.code ? { mfaToken: credentials.code } : {}),
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    }),
  }).catch(() => null);
  // A wrong password is a 200 with type "failure" (LoginResponse in
  // crates/http/src/auth/oauth/auth.rs); an HTTP error is Stalwart not answering as it should.
  if (!response?.ok) return { status: "unavailable" };
  const login = loginResponse.parse(await response.json());
  if (login.type === "mfaRequired") return { status: "mfa" };
  if (login.type !== "authenticated") return { status: "failed" };

  const token = await postToken(stalwartUrl, {
    grant_type: "authorization_code",
    code: login.client_code,
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
