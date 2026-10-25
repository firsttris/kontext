/**
 * The boxes' files at /api/phone/box/files (with their token): the sounds the dialplan plays, and the
 * messages callers left on the mailbox.
 */
import { Hono } from "hono";
import { type PhoneFiles, wavResponse } from "./files";
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
}: {
  store: Pick<PhoneStore, "boxOfToken" | "settings">;
  files: Pick<PhoneFiles, "readSound">;
  voicemail: ReturnType<typeof createVoicemail>;
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

  app.put("/voicemail/:call", async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_UPLOAD) return c.json({ error: "Zu groß" }, 413);
    const result = await voicemail.receive(c.get("boxId"), c.req.param("call"), bytes);
    if (result === "not-found") return c.json({ error: "Unbekannter Anruf" }, 404);
    if (result === "bad-file") return c.json({ error: "Kein WAV in 8 kHz, mono, 16 Bit" }, 400);
    return c.body(null, 204);
  });

  return app;
};
