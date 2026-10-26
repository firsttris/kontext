/**
 * The most a route reads of a request body. Without it, Bun takes up to 128 MB per request
 * (maxRequestBodySize) and a route reads all of it before it can look at the size; with it, a
 * larger body is refused as it comes in (Content-Length, or counted while streaming).
 */
import { bodyLimit } from "hono/body-limit";

export const limitBody = (maxSize: number) =>
  bodyLimit({ maxSize, onError: (c) => c.json({ error: "Zu groß" }, 413) });

/** Bun's own limit: nothing larger reaches any route. */
export const BUN_MAX_BODY = 128 * 1024 * 1024;
