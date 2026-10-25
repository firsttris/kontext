/**
 * Agents over MCP: /mcp answers with the tools for the bearer of an access key, /api/mcp-keys lets
 * the signed-in person make, list and revoke their keys. Making a key asks for the password (and
 * the two-factor code) again: the key gets its own Stalwart sign-in, so revoking it ends exactly
 * that access.
 */
import { Hono } from "hono";
import { z } from "zod";
import { createJmapClient } from "@/jmap/client";
import type { Grants } from "../auth";
import type { LoginResult } from "../stalwart";
import type { Task } from "../tasks/tasks";
import { keyFromHeader, type McpKeys } from "./keys";
import { createReader } from "./reader";
import { handleMcp } from "./server";

export type McpDeps = {
  keys: McpKeys;
  grants: Pick<Grants, "accessToken" | "save">;
  stalwartUrl: string;
  version: string;
  /** The signed-in person (cookie session), or null. */
  userOf: (request: Request) => Promise<{ id: string; email: string } | null>;
  login: (credentials: { email: string; password: string; code?: string }) => Promise<LoginResult>;
  tasks: (accountIds: string[], me: string | undefined) => Promise<Task[]>;
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

export const createMcpEndpoint =
  ({ keys, grants, stalwartUrl, version, tasks, fetch: base = fetch }: McpDeps) =>
  async (request: Request): Promise<Response> => {
    const key = keyFromHeader(request.headers.get("authorization"));
    if (!key) return unauthorized("Zugangsschlüssel fehlt");
    const caller = await keys.resolve(key);
    if (!caller) return unauthorized("Zugangsschlüssel unbekannt oder widerrufen");
    const token = await grants.accessToken(caller.sessionId);
    if (!token) return unauthorized("Zugang abgelaufen – bitte einen neuen Schlüssel anlegen");
    const reader = createReader({ client: clientWith(stalwartUrl, token, base), tasks });
    return handleMcp(request, reader, version);
  };

export const createMcpKeyRoutes = ({ keys, grants, userOf, login }: McpDeps) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json({ keys: await keys.list(user.id) });
  });

  app.post("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Name und Passwort fehlen." }, 400);
    const { name, password, code } = parsed.data;
    const result = await login({ email: user.email, password, code });
    if (result.status === "mfa") return c.json({ status: "mfa" as const });
    if (result.status === "failed") return c.json({ error: "Passwort oder Code falsch." }, 401);
    const sessionId = await keys.openSession(user.id, name);
    try {
      await grants.save(sessionId, result.tokens);
    } catch (error) {
      await keys.dropSession(sessionId);
      throw error;
    }
    const { key, info } = await keys.create(user.id, sessionId, name);
    return c.json({ status: "ok" as const, key, info });
  });

  app.delete("/:id", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    if (!(await keys.remove(user.id, c.req.param("id")))) {
      return c.json({ error: "Schlüssel nicht gefunden" }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
};
