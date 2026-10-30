/**
 * /api/access: the browsers the signed-in person is signed in with, and signing out the others,
 * one or all at once (Einstellungen → Zugänge). The own session is ended with "Abmelden".
 */
import { Hono } from "hono";
import { devicesOf } from "./devices";
import type { SessionStore } from "./store";

export type AccessDeps = {
  sessions: SessionStore;
  /** The cookie session making the request and its person, or null. */
  sessionOf: (request: Request) => Promise<{ id: string; userId: string } | null>;
};

export const createAccessRoutes = ({ sessions, sessionOf }: AccessDeps) => {
  const app = new Hono();

  const devices = async (session: { id: string; userId: string }) => {
    const { rows, heldIds } = await sessions.list(session.userId);
    return devicesOf(rows, heldIds, session.id);
  };

  app.get("/sessions", async (c) => {
    const session = await sessionOf(c.req.raw);
    if (!session) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json({ devices: await devices(session) });
  });

  /** All other browsers; app passwords and agents stay. */
  app.delete("/sessions", async (c) => {
    const session = await sessionOf(c.req.raw);
    if (!session) return c.json({ error: "Nicht angemeldet" }, 401);
    const others = (await devices(session)).filter((device) => !device.current);
    await sessions.end(
      session.userId,
      others.map((device) => device.id),
    );
    return c.json({ ended: others.length });
  });

  app.delete("/sessions/:id", async (c) => {
    const session = await sessionOf(c.req.raw);
    if (!session) return c.json({ error: "Nicht angemeldet" }, 401);
    const id = c.req.param("id");
    if (id === session.id)
      return c.json({ error: "Dieses Gerät meldest du mit „Abmelden“ ab." }, 400);
    const device = (await devices(session)).find((d) => d.id === id);
    if (!device) return c.json({ error: "Nicht gefunden" }, 404);
    await sessions.end(session.userId, [id]);
    return c.json({ ok: true });
  });

  return app;
};
