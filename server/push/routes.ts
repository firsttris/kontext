/**
 * /api/push: the server's public key for the browsers, and their subscriptions. A subscription
 * belongs to the sign-in session it was made in; the server only ever posts to the browsers'
 * push services (no address of one's choosing – the server must not be sent anywhere inside).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { SessionInfo } from "../session-info";
import type { PushStore } from "./store";

/** Google (Chrome, Edge on Android), Mozilla, Apple, Microsoft (Edge on Windows). */
const PUSH_SERVICES = [
  "googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export const isPushService = (endpoint: string, anyEndpoint = false): boolean => {
  try {
    const url = new URL(endpoint);
    if (anyEndpoint) return url.protocol === "https:" || url.protocol === "http:";
    return (
      url.protocol === "https:" &&
      PUSH_SERVICES.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
};

const subscriptionSchema = z.object({
  endpoint: z.string().max(2000),
  keys: z.object({ p256dh: z.string().min(80).max(120), auth: z.string().min(16).max(40) }),
});

export type PushDeps = {
  store: PushStore;
  publicKey: string;
  infoOf: (request: Request) => Promise<SessionInfo | null>;
  /** After a change: the mail watcher looks again whom to watch. */
  changed?: () => void;
  anyEndpoint?: boolean;
};

export const createPushRoutes = ({
  store,
  publicKey,
  infoOf,
  changed = () => undefined,
  anyEndpoint = false,
}: PushDeps) => {
  const app = new Hono();

  app.get("/key", (c) => c.json({ publicKey }));

  app.post("/subscriptions", async (c) => {
    const info = await infoOf(c.req.raw);
    const me = info?.accounts.find((account) => account.isPersonal)?.id;
    if (!info || !me) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = subscriptionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !isPushService(parsed.data.endpoint, anyEndpoint)) {
      return c.json({ error: "Kein Push-Dienst eines Browsers." }, 400);
    }
    await store.save(parsed.data, me, info.sessionId);
    changed();
    return c.json({ ok: true }, 201);
  });

  app.delete("/subscriptions", async (c) => {
    const info = await infoOf(c.req.raw);
    const me = info?.accounts.find((account) => account.isPersonal)?.id;
    if (!info || !me) return c.json({ error: "Nicht angemeldet" }, 401);
    const body = (await c.req.json().catch(() => null)) as { endpoint?: string } | null;
    const own = await store.targetsOf([me]);
    if (body?.endpoint && own.some((target) => target.endpoint === body.endpoint)) {
      await store.remove(body.endpoint);
      changed();
    }
    return c.json({ ok: true });
  });

  return app;
};
