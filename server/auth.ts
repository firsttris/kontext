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
import { providerPlugins, schreibzeugClientOf } from "./oidc/provider";
import { loginAtStalwart, refreshAtStalwart, type StalwartTokens, whoAmI } from "./stalwart";

const DAY = 24 * 60 * 60;

/** Stores and renews the Stalwart tokens of a session. */
export const createGrants = (db: Db, sealer: Sealer, stalwartUrl: string) => {
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

  /** A valid access token for the session, refreshed when needed; null means sign in again. */
  const accessToken = async (sessionId: string): Promise<string | null> => {
    const [row] = await db
      .select()
      .from(schema.stalwartGrant)
      .where(eq(schema.stalwartGrant.sessionId, sessionId));
    if (!row) return null;
    if (row.accessExpiresAt.getTime() > Date.now()) return sealer.open(row.accessToken);
    const renewed = await refreshAtStalwart(stalwartUrl, await sealer.open(row.refreshToken));
    if (!renewed) {
      await db.delete(schema.stalwartGrant).where(eq(schema.stalwartGrant.sessionId, sessionId));
      return null;
    }
    await save(sessionId, renewed);
    return renewed.accessToken;
  };

  return { save, accessToken };
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
  /** The signed authorization request when the sign-in is for Schreibzeug (oauth-provider). */
  oauth_query: z.string().max(8192).optional(),
});

/** The name the person sends mail as, from their Stalwart account (session-info.ts). */
export type NameOf = (accessToken: string, email: string) => Promise<string>;

const stalwartSignIn = (stalwartUrl: string, grants: Grants, nameOf: NameOf) =>
  ({
    id: "stalwart-sign-in",
    endpoints: {
      signInStalwart: createAuthEndpoint(
        "/sign-in/stalwart",
        { method: "POST", body: signInBody },
        async (ctx) => {
          const result = await loginAtStalwart(stalwartUrl, ctx.body);
          if (result.status === "mfa") return ctx.json({ status: "mfa" as const });
          if (result.status === "failed") {
            throw new APIError("UNAUTHORIZED", { message: "Anmeldung fehlgeschlagen" });
          }
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

export const createAuth = (env: Env, db: Db, grants: Grants, nameOf: NameOf) =>
  betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // Passwords belong to Stalwart; Better Auth only keeps the sessions.
    emailAndPassword: { enabled: false },
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
      stalwartSignIn(env.STALWART_URL, grants, nameOf),
      // Kontext signs people in to Schreibzeug, when it is set up (oidc/provider.ts).
      ...(schreibzeugClientOf(env) ? providerPlugins() : []),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;
