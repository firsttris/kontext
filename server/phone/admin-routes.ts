/**
 * Firmenverwaltung → Telefonie (/api/company/phone): pair a box, set the box's login at the
 * Fritzbox and who hears calls ring. Behind the Firmenverwaltung's own check (company admins only).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../company/context";
import { lineSchema } from "./protocol";
import type { PhoneService } from "./service";
import type { PhoneStore } from "./store";

const lineInput = lineSchema.extend({
  /** Left empty, the stored password stays. */
  password: z.string().max(200).default(""),
});
const ringSchema = z.object({ members: z.array(z.string().min(1).max(64)).max(200) });
const callbacksSchema = z.object({ board: z.string().min(1).max(64).nullable() });
const boxSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const createPhoneAdminRoutes = ({
  store,
  service,
  sipStatus,
}: {
  store: PhoneStore;
  service: PhoneService;
  /** Whether LiveKit SIP is set up, or why not. */
  sipStatus: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) => {
  const app = new Hono<Env>();

  app.get("/", async (c) => {
    const [settings, boxes, sip] = await Promise.all([
      store.settings(),
      store.boxes(),
      sipStatus(),
    ]);
    const online = service.online();
    return c.json({
      boxes: boxes.map((box) => ({ ...box, online: online.includes(box.id) })),
      line: settings.line
        ? {
            registrar: settings.line.registrar,
            username: settings.line.username,
            hasPassword: true,
          }
        : null,
      ring: settings.ring,
      callbackBoard: settings.callbackBoard,
      sip,
    });
  });

  app.put("/line", async (c) => {
    const parsed = lineInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig" }, 400);
    const settings = await store.settings();
    const password = parsed.data.password || settings.line?.password;
    if (!password) return c.json({ error: "Passwort fehlt" }, 400);
    await store.saveSettings({ ...settings, line: { ...parsed.data, password } });
    await service.reconfigure();
    return c.body(null, 204);
  });

  app.put("/ring", async (c) => {
    const parsed = ringSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    const known = new Set(c.get("loaded").company.employees.map((employee) => employee.id));
    if (!parsed.data.members.every((id) => known.has(id))) {
      return c.json({ error: "Unbekannte Person" }, 400);
    }
    const settings = await store.settings();
    await store.saveSettings({ ...settings, ring: [...new Set(parsed.data.members)] });
    return c.body(null, 204);
  });

  // Missed calls leave "Zurückrufen" on this board: a person's own or a shared mailbox's.
  app.put("/callbacks", async (c) => {
    const parsed = callbacksSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    const { employees, mailboxes } = c.get("loaded").company;
    const boards = new Set([...employees, ...mailboxes].map((owner) => owner.id));
    if (parsed.data.board && !boards.has(parsed.data.board)) {
      return c.json({ error: "Unbekanntes Board" }, 400);
    }
    await store.saveSettings({ ...(await store.settings()), callbackBoard: parsed.data.board });
    return c.body(null, 204);
  });

  // A new box: its pairing code is shown once and holds for half an hour.
  app.post("/boxes", async (c) => {
    const parsed = boxSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Name fehlt" }, 400);
    const { box, code } = await store.startPairing(parsed.data.name);
    return c.json({ box, code });
  });

  app.delete("/boxes/:id", async (c) => {
    await store.removeBox(c.req.param("id"));
    return c.body(null, 204);
  });

  return app;
};
