/** The Datensicherung under /api/company/backup: what the host reports, the time, "Jetzt sichern". */
import { Hono } from "hono";
import type { BackupControl } from "./backup";
import { backupSettingsSchema } from "./backup-schema";
import { bad, bodyOf, type Env } from "./context";

export const backupRoutes = (control: BackupControl) => {
  const app = new Hono<Env>();

  app.get("/", async (c) => c.json(await control.read()));

  app.put("/settings", async (c) => {
    const body = await bodyOf(c, backupSettingsSchema);
    if (!body) return bad("Uhrzeit als HH:MM angeben.");
    await control.saveSettings(body);
    return c.json(body);
  });

  app.post("/run", async (c) => {
    const { status } = await control.read();
    if (status?.state === "running") return c.json({ error: "Die Sicherung läuft schon." }, 409);
    await control.requestRun();
    return c.json({ ok: true });
  });

  return app;
};
