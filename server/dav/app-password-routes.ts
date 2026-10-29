/**
 * /api/app-passwords: the signed-in person lists, makes and revokes their app passwords for
 * CalDAV (app-passwords.ts). Making one asks for the password (and the two-factor code) again,
 * like an agent's access key (server/mcp/routes.ts): the app password gets its own Stalwart
 * sign-in, so revoking it ends exactly that access.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Grants } from "../auth";
import type { LoginResult } from "../stalwart";
import type { AppPasswords } from "./app-passwords";

export type AppPasswordDeps = {
  appPasswords: Pick<AppPasswords, "openSession" | "dropSession" | "create" | "list" | "remove">;
  grants: Pick<Grants, "save">;
  /** The signed-in person (cookie session), or null. */
  userOf: (request: Request) => Promise<{ id: string; email: string } | null>;
  login: (credentials: { email: string; password: string; code?: string }) => Promise<LoginResult>;
  /** Whether this person may try a password once more now (server/mcp/attempts.ts). */
  mayTryPassword: (userId: string) => boolean;
};

const newSchema = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(1024),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/)
    .optional(),
});

export const createAppPasswordRoutes = (deps: AppPasswordDeps) => {
  const { appPasswords, grants, userOf, login, mayTryPassword } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json({ appPasswords: await appPasswords.list(user.id) });
  });

  app.post("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Name und Passwort fehlen." }, 400);
    const { name, password, code } = parsed.data;
    if (!mayTryPassword(user.id)) {
      return c.json({ error: "Zu viele Versuche – bitte in einer Minute noch einmal." }, 429);
    }
    const result = await login({ email: user.email, password, code });
    if (result.status === "mfa") return c.json({ status: "mfa" as const });
    if (result.status === "failed") return c.json({ error: "Passwort oder Code falsch." }, 401);
    if (result.status === "unavailable") {
      return c.json({ error: "Der Mailserver antwortet gerade nicht." }, 503);
    }
    const sessionId = await appPasswords.openSession(user.id, name);
    try {
      await grants.save(sessionId, result.tokens);
    } catch (error) {
      await appPasswords.dropSession(sessionId);
      throw error;
    }
    const created = await appPasswords.create(user.id, sessionId, name);
    return c.json({ status: "ok" as const, ...created });
  });

  app.delete("/:id", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    if (!(await appPasswords.remove(user.id, c.req.param("id")))) {
      return c.json({ error: "App-Passwort nicht gefunden" }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
};
