/**
 * /api/meet: meetings by link. Signed in, one creates a meeting (POST /) and joins as oneself;
 * without an account one joins as a guest with a name, once a colleague is there. Only the join
 * and "is it running" are open without a session.
 */
import { Hono } from "hono";
import type { Viewer } from "../chat/chat";
import { participantMetadata, roomOf } from "./calls";
import { joinToken, type LiveKitConfig } from "./livekit";
import {
  guestIdentity,
  guestSchema,
  hostPresent,
  meetingIdSchema,
  meetingKey,
  meetingUrl,
  newMeetingId,
} from "./meetings";
import type { CallState } from "./routes";

export type MeetDeps = {
  livekit: LiveKitConfig;
  publicUrl: string | null;
  /** Kontext's address, for the links (BETTER_AUTH_URL). */
  origin: string;
  viewerOf: (request: Request) => Promise<Viewer | null>;
  nameOf: (request: Request) => Promise<string>;
};

export const createMeetRoutes = (deps: MeetDeps, state: CallState) => {
  const app = new Hono();

  app.post("/", async (c) => {
    if (!(await deps.viewerOf(c.req.raw))) return c.json({ error: "Nicht angemeldet" }, 401);
    const id = newMeetingId();
    return c.json({ id, url: meetingUrl(deps.origin, id) });
  });

  app.get("/:id", async (c) => {
    const id = meetingIdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Nicht gefunden" }, 404);
    const signedIn = Boolean(await deps.viewerOf(c.req.raw));
    return c.json({ running: hostPresent(state.all(), id.data), signedIn });
  });

  app.post("/:id/join", async (c) => {
    const id = meetingIdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Nicht gefunden" }, 404);
    const viewer = await deps.viewerOf(c.req.raw);
    const room = roomOf(meetingKey(id.data));
    const metadata = participantMetadata(true);
    if (viewer) {
      const name = await deps.nameOf(c.req.raw);
      const token = await joinToken(deps.livekit, { identity: viewer.me, name, room, metadata });
      return c.json({ token, url: deps.publicUrl, name });
    }
    const guest = guestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!guest.success) return c.json({ error: "Name fehlt" }, 400);
    // Guests wait until someone of the company has opened the meeting.
    if (!hostPresent(state.all(), id.data)) return c.json({ error: "Noch nicht begonnen" }, 409);
    const token = await joinToken(deps.livekit, {
      identity: guestIdentity(),
      name: guest.data.name,
      room,
      metadata,
    });
    return c.json({ token, url: deps.publicUrl, name: guest.data.name });
  });

  return app;
};
