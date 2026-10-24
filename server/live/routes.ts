/**
 * /api/live: the live connection as Server-Sent Events. The browser's EventSource connects again
 * by itself; the server ends each connection after a while, so a reconnect picks up changed
 * access (someone left info@) without the hub checking it on every event.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Viewer } from "../chat/chat";
import type { Hub, LiveEvent } from "./hub";

export type LiveDeps = {
  hub: Hub;
  viewerOf: (request: Request) => Promise<Viewer | null>;
  /** How often a comment keeps proxies from closing a quiet connection. */
  heartbeatMs?: number;
  /** After how long the server ends a connection (the browser then connects again). */
  maxAgeMs?: number;
};

export const createLiveRoutes = ({
  hub,
  viewerOf,
  heartbeatMs = 25_000,
  maxAgeMs = 15 * 60_000,
}: LiveDeps) => {
  const app = new Hono();
  app.get("/", async (c) => {
    const viewer = await viewerOf(c.req.raw);
    if (!viewer) return c.json({ error: "Nicht angemeldet" }, 401);
    c.header("cache-control", "no-store");
    // Nginx and the like pass the events on at once instead of buffering them.
    c.header("x-accel-buffering", "no");
    return streamSSE(c, async (stream) => {
      const queue: LiveEvent[] = [];
      let wake: (() => void) | null = null;
      const send = (event: LiveEvent) => {
        queue.push(event);
        wake?.();
      };
      const unsubscribe = hub.subscribe(viewer, send);
      // Who is online, unless the hub just told it (it does when this person came online).
      if (!queue.some((event) => event.type === "presence")) {
        queue.push({ type: "presence", online: hub.online() });
      }
      let open = true;
      const close = () => {
        open = false;
        wake?.();
      };
      stream.onAbort(close);
      const ending = setTimeout(close, maxAgeMs);
      const beat = setInterval(() => void stream.write(": ping\n\n").catch(close), heartbeatMs);
      try {
        while (open) {
          const event = queue.shift();
          if (event) {
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = null;
        }
      } finally {
        clearTimeout(ending);
        clearInterval(beat);
        unsubscribe();
      }
    });
  });
  return app;
};
