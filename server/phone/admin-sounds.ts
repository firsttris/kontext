/**
 * Firmenverwaltung → Telefonie → Ansagen (/api/company/phone/sounds): greetings recorded in the
 * browser or uploaded, already converted to the telephone's WAV there. Kept by their content's id;
 * a greeting that goes is no longer played anywhere.
 */
import { Hono } from "hono";
import type { Env } from "../company/context";
import { type PhoneFiles, wavResponse } from "./files";
import type { PhoneService } from "./service";
import { isPhoneWav, soundId, wavInfo } from "./sounds";
import type { PhoneSettings, PhoneStore } from "./store";

const MAX_BYTES = 4 * 1024 * 1024;

/** The settings without a sound: where it was chosen, nothing is chosen any more. */
export const withoutSound = (settings: PhoneSettings, id: string): PhoneSettings => ({
  ...settings,
  sounds: settings.sounds.filter((sound) => sound.id !== id),
  mailbox: {
    ...settings.mailbox,
    greeting: settings.mailbox.greeting === id ? null : settings.mailbox.greeting,
  },
});

export const createPhoneSoundRoutes = ({
  store,
  service,
  files,
}: {
  store: PhoneStore;
  service: Pick<PhoneService, "reconfigure">;
  files: PhoneFiles;
}) => {
  const app = new Hono<Env>();

  app.put("/", async (c) => {
    const name = (c.req.query("name") ?? "").trim().slice(0, 80);
    if (!name) return c.json({ error: "Name fehlt" }, 400);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_BYTES || !isPhoneWav(wavInfo(bytes))) {
      return c.json({ error: "Kein WAV in 8 kHz, mono, 16 Bit, höchstens drei Minuten" }, 400);
    }
    const sound = { id: await soundId(bytes), name, seconds: wavInfo(bytes)!.seconds };
    await files.saveSound(sound.id, bytes);
    const settings = await store.settings();
    await store.saveSettings({
      ...settings,
      sounds: [...settings.sounds.filter((other) => other.id !== sound.id), sound],
    });
    return c.json({ sound });
  });

  app.get("/:id", async (c) => {
    const bytes = await files.readSound(c.req.param("id"));
    if (!bytes) return c.json({ error: "Nicht gefunden" }, 404);
    return wavResponse(bytes);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await store.saveSettings(withoutSound(await store.settings(), id));
    await files.removeSound(id).catch(() => undefined);
    await service.reconfigure();
    return c.body(null, 204);
  });

  return app;
};
