/**
 * Sign-in with Better Auth; the users and passwords stay in Stalwart.
 *
 * The plugin `stalwartSignIn` adds POST /api/auth/sign-in/stalwart: it checks e-mail, password
 * and (if the account has two-factor sign-in) the code at Stalwart, keeps Stalwart's tokens for
 * the new session and sets Better Auth's session cookie. Passkeys can be added later with
 * Better Auth's passkey plugin; such a session then gets its Stalwart token from an app password.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Sealer } from "./crypto";
import { type Db, schema } from "./db";
import type { Env } from "./env";
import { attemptOf, createLoginFailures, type FailureLimit, loginKey } from "./failures";
import { providerPlugins } from "./oidc/provider";
import {
  loginAtStalwart,
  refreshAtStalwart,
  revokeAtStalwart,
  type StalwartTokens,
  whoAmI,
} from "./stalwart";
import { stalwartUnavailable } from "./stalwart-away";

const DAY = 24 * 60 * 60;

/** Better Auth's own routes Kontext does not use (they would bypass Stalwart). */
export const DISABLED_PATHS = [
  "/update-user",
  "/change-email",
  "/change-password",
  "/set-password",
  "/delete-user",
  "/token",
] as const;

/** Stores and renews the Stalwart tokens of a session. */
export const createGrants = (
  db: Db,
  sealer: Sealer,
  stalwartUrl: string,
  refresh = refreshAtStalwart,
  revoke = revokeAtStalwart,
) => {
  const save = async (sessionId: string, tokens: StalwartTokens) => {
    const row = {
      sessionId,
      accessToken: await sealer.seal(tokens.accessToken),
      refreshToken: await sealer.seal(tokens.refreshToken),
      accessExpiresAt: tokens.accessExpiresAt,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.stalwartGrant)
      .values(row)
      .onConflictDoUpdate({ target: schema.stalwartGrant.sessionId, set: row });
  };

  /**
   * A valid access token for the session, refreshed when needed; null means sign in again. Throws
   * (`isStalwartUnavailable`) while Stalwart does not answer as it should: the session stays.
   */
  const accessToken = async (sessionId: string): Promise<string | null> => {
    const [row] = await db
      .select()
      .from(schema.stalwartGrant)
      .where(eq(schema.stalwartGrant.sessionId, sessionId));
    if (!row) return null;
    if (row.accessExpiresAt.getTime() > Date.now()) return sealer.open(row.accessToken);
    const renewed = await refresh(stalwartUrl, await sealer.open(row.refreshToken));
    // Only a refused token ends the grant; while Stalwart is down or limits Kontext, the session
    // waits and goes on once it answers again.
    if (renewed.status === "unavailable") throw stalwartUnavailable();
    if (renewed.status === "rejected") {
      await db.delete(schema.stalwartGrant).where(eq(schema.stalwartGrant.sessionId, sessionId));
      return null;
    }
    await save(sessionId, renewed.tokens);
    return renewed.tokens.accessToken;
  };

  /**
   * Before a session ends: its grant at Stalwart ends too. Otherwise it stays in the person's list
   * of grants until the refresh token runs out, although no one holds the token any more.
   */
  const end = async (sessionId: string): Promise<void> => {
    const [row] = await db
      .select({ refreshToken: schema.stalwartGrant.refreshToken })
      .from(schema.stalwartGrant)
      .where(eq(schema.stalwartGrant.sessionId, sessionId));
    if (!row) return;
    await revoke(stalwartUrl, await sealer.open(row.refreshToken));
    await db.delete(schema.stalwartGrant).where(eq(schema.stalwartGrant.sessionId, sessionId));
  };

  return { save, accessToken, end };
};

export type Grants = ReturnType<typeof createGrants>;

const signInBody = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(1024),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/)
    .optional(),
  /** The signed authorization request when the sign-in is for an OAuth client (Schreibzeug, an agent). */
  oauth_query: z.string().max(8192).optional(),
});

/** The name the person sends mail as, from their Stalwart account (session-info.ts). */
export type NameOf = (accessToken: string, email: string) => Promise<string>;

const stalwartSignIn = (
  stalwartUrl: string,
  grants: Grants,
  nameOf: NameOf,
  failures: FailureLimit,
) =>
  ({
    id: "stalwart-sign-in",
    endpoints: {
      signInStalwart: createAuthEndpoint(
        "/sign-in/stalwart",
        { method: "POST", body: signInBody },
        async (ctx) => {
          // Per login name, on top of Better Auth's limit per address (failures.ts).
          const login = loginKey(ctx.body.email);
          if (failures.blocked(login)) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Zu viele Fehlversuche. Bitte in einer Viertelstunde erneut versuchen.",
            });
          }
          const result = await loginAtStalwart(stalwartUrl, ctx.body);
          // No verdict on the password: counts against nobody.
          if (result.status === "unavailable") {
            throw new APIError("SERVICE_UNAVAILABLE", {
              message: "Der Mailserver antwortet gerade nicht. Bitte gleich erneut versuchen.",
            });
          }
          if (result.status === "failed") {
            failures.failed(login, await attemptOf(ctx.body.password, ctx.body.code));
            throw new APIError("UNAUTHORIZED", { message: "Anmeldung fehlgeschlagen" });
          }
          // The code is still to come: only a whole sign-in clears the count, or sending the
          // password alone between wrong codes would let them be guessed without end.
          if (result.status === "mfa") return ctx.json({ status: "mfa" as const });
          failures.cleared(login);
          // Stalwart may accept a bare name; the account's real address comes from the session.
          const { email } = await whoAmI(stalwartUrl, result.tokens.accessToken);
          const adapter = ctx.context.internalAdapter;
          const name = await nameOf(result.tokens.accessToken, email);
          const found = await adapter.findUserByEmail(email);
          // The name goes to Schreibzeug with the sign-in; it follows the one in Stalwart.
          const user = found
            ? found.user.name === name
              ? found.user
              : await adapter.updateUser(found.user.id, { name })
            : await adapter.createUser(
                { email, name, emailVerified: true },
                { method: "stalwart" },
              );
          const session = await adapter.createSession(user.id);
          await grants.save(session.id, result.tokens);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: "ok" as const, email });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

export const createAuth = (
  env: Env,
  db: Db,
  grants: Grants,
  nameOf: NameOf,
  failures: FailureLimit = createLoginFailures(),
) =>
  betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // Passwords belong to Stalwart; Better Auth only keeps the sessions.
    emailAndPassword: { enabled: false },
    // Name and address come from Stalwart at each sign-in; nobody changes them here, or a person
    // could take a colleague's name into Schreibzeug's tokens. /token would hand out JWTs signed
    // with the provider's keys to any session.
    disabledPaths: [...DISABLED_PATHS],
    session: { expiresIn: 90 * DAY, updateAge: DAY },
    rateLimit: {
      enabled: true,
      storage: "memory",
      customRules: {
        "/sign-in/stalwart": { window: 60, max: env.SIGN_IN_PER_MINUTE },
        // Asked on every app start; a 429 there would look like being signed out.
        "/get-session": false,
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    },
    plugins: [
      stalwartSignIn(env.STALWART_URL, grants, nameOf, failures),
      // Kontext signs people in to Schreibzeug and agents to /mcp (oidc/provider.ts).
      ...providerPlugins(env.BETTER_AUTH_URL),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;
