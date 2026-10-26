/**
 * The boxes' files at /api/phone/box/files (with their token): the sounds the dialplan plays, and the
 * messages callers left on the mailbox.
 */

import { Hono } from "hono";
import { BUN_MAX_BODY, limitBody } from "../body-limit";
import type { createFaxes } from "./fax";
import { type PhoneFiles, wavResponse } from "./files";
import type { createRecordings } from "./recordings";
import type { PhoneStore } from "./store";
import type { createVoicemail } from "./voicemail";

/** A message of three minutes is under 3 MB; more is not a message. */
const MAX_UPLOAD = 6 * 1024 * 1024;

export const bearer = (request: Request) =>
  request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";

export const createBoxFileRoutes = ({
  store,
  files,
  voicemail,
  faxes,
  recordings,
}: {
  store: Pick<PhoneStore, "boxOfToken" | "settings">;
  files: Pick<PhoneFiles, "readSound">;
  voicemail: ReturnType<typeof createVoicemail>;
  faxes: ReturnType<typeof createFaxes>;
  recordings: ReturnType<typeof createRecordings>;
}) => {
  const app = new Hono<{ Variables: { boxId: string } }>();

  app.use(async (c, next) => {
    const box = await store.boxOfToken(bearer(c.req.raw));
    if (!box) return c.json({ error: "Unbekannte Box" }, 401);
    c.set("boxId", box.id);
    await next();
  });

  app.get("/sounds/:id", async (c) => {
    const id = c.req.param("id");
    const known = (await store.settings()).sounds.some((sound) => sound.id === id);
    const bytes = known ? await files.readSound(id) : null;
    if (!bytes) return c.json({ error: "Nicht gefunden" }, 404);
    return wavResponse(bytes);
  });

  app.put("/voicemail/:call", limitBody(MAX_UPLOAD), async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_UPLOAD) return c.json({ error: "Zu groß" }, 413);
    const result = await voicemail.receive(c.get("boxId"), c.req.param("call"), bytes);
    if (result === "not-found") return c.json({ error: "Unbekannter Anruf" }, 404);
    if (result === "bad-file") return c.json({ error: "Kein WAV in 8 kHz, mono, 16 Bit" }, 400);
    return c.body(null, 204);
  });

  // A recording can be long; Bun takes no more than 128 MB in one request (about two hours).
  app.put("/recording/:call", limitBody(BUN_MAX_BODY), async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const result = await recordings.receive(c.get("boxId"), c.req.param("call"), bytes);
    if (result === "not-found") return c.json({ error: "Unbekannte Aufnahme" }, 404);
    if (result === "bad-file") return c.json({ error: "Kein WAV" }, 400);
    return c.body(null, 204);
  });

  app.put("/fax/:call", limitBody(4 * MAX_UPLOAD), async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > 4 * MAX_UPLOAD) return c.json({ error: "Zu groß" }, 413);
    const result = await faxes.receive(c.get("boxId"), c.req.param("call"), bytes);
    if (result === "not-found") return c.json({ error: "Unbekannter Anruf" }, 404);
    if (result === "bad-file") return c.json({ error: "Kein PDF" }, 400);
    return c.body(null, 204);
  });

  return app;
};
