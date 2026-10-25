/**
 * Firmenverwaltung → Telefonie (/api/company/phone): pair a box, set the box's login at the
 * Fritzbox and who hears calls ring. Behind the Firmenverwaltung's own check (company admins only).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Loaded } from "../company/context";
import { toE164 } from "./numbers";
import { hoursSchema, lineSchema } from "./protocol";
import type { PhoneService } from "./service";
import { type PhoneStore, randomSecret } from "./store";

const lineInput = lineSchema.extend({
  /** Left empty, the stored password stays. */
  password: z.string().max(200).default(""),
});
const ringSchema = z.object({
  members: z.array(z.string().min(1).max(64)).max(200),
  mode: z.enum(["all", "order"]).default("all"),
  stepSeconds: z.number().int().min(5).max(60).default(15),
  forward: z
    .object({
      number: z.string().trim().min(3).max(40),
      afterSeconds: z.number().int().min(0).max(120),
    })
    .nullable()
    .default(null),
});
const callbacksSchema = z.object({ board: z.string().min(1).max(64).nullable() });
const mailboxSchema = z.object({
  enabled: z.boolean(),
  ringSeconds: z.number().int().min(10).max(120),
  greeting: z.string().max(64).nullable(),
  /** The account whose inbox gets the messages: a shared mailbox or a person. */
  deliverTo: z.string().min(1).max(64).nullable(),
});
const hoursInput = z.object({
  enabled: z.boolean(),
  open: hoursSchema.shape.open,
  closedDays: z
    .array(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().trim().max(60),
      }),
    )
    .max(100),
  greeting: z.string().max(64).nullable(),
});
const linesSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9]{1,12}$/)
          .optional(),
        label: z.string().trim().min(1).max(60),
        username: z.string().trim().min(1).max(100),
        /** Left empty, the stored password stays. */
        password: z.string().max(200).default(""),
        ring: z.array(z.string().min(1).max(64)).max(200),
      }),
    )
    .max(9),
});
const desksSchema = z.object({
  desks: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9]{1,12}$/)
          .optional(),
        label: z.string().trim().min(1).max(60),
        mac: z
          .string()
          .transform((mac) => mac.toLowerCase().replace(/[^0-9a-f]/g, ""))
          .pipe(z.string().length(12)),
        extension: z.string().regex(/^[1-9]\d{1,3}$/),
        member: z.string().min(1).max(64).nullable(),
      }),
    )
    .max(30),
});
const menuInput = z.object({
  enabled: z.boolean(),
  greeting: z.string().max(64).nullable(),
  options: z
    .array(
      z.object({
        digit: z.string().regex(/^[0-9]$/),
        label: z.string().trim().min(1).max(60),
        members: z.array(z.string().min(1).max(64)).max(200),
        mailbox: z.boolean(),
      }),
    )
    .max(10),
});
const boxSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** Short ids for the box's endpoint names ("fritzbox-<id>"). */
const newLineId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    "abcdefghijklmnopqrstuvwxyz0123456789".charAt(byte % 36),
  ).join("");

/** A person or a shared mailbox of the company, by its account id. */
const ownerOf = (loaded: Loaded, id: string) =>
  [...loaded.company.employees, ...loaded.company.mailboxes].find((owner) => owner.id === id) ??
  null;

export const createPhoneAdminRoutes = ({
  store,
  service,
  sipStatus,
  sounds,
}: {
  store: PhoneStore;
  service: PhoneService;
  /** Whether LiveKit SIP is set up, or why not. */
  sipStatus: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** The greetings' own routes (admin-sounds.ts). */
  sounds: Hono<Env>;
}) => {
  const app = new Hono<Env>();
  app.route("/sounds", sounds);

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
      extraLines: settings.extraLines.map(({ password: _, ...line }) => line),
      deskPhones: settings.deskPhones.map(({ password: _, ...desk }) => desk),
      ringMode: settings.ringMode,
      ringStepSeconds: settings.ringStepSeconds,
      forward: settings.forward,
      callbackBoard: settings.callbackBoard,
      sounds: settings.sounds,
      mailbox: {
        enabled: settings.mailbox.enabled,
        ringSeconds: settings.mailbox.ringSeconds,
        greeting: settings.mailbox.greeting,
        deliverTo: settings.mailbox.deliverTo?.accountId ?? null,
      },
      hours: settings.hours,
      menu: settings.menu,
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
    const { members, mode, stepSeconds, forward } = parsed.data;
    const number = forward ? toE164(forward.number) : null;
    if (forward && !number) return c.json({ error: "Keine gültige Nummer" }, 400);
    const settings = await store.settings();
    await store.saveSettings({
      ...settings,
      ring: [...new Set(members)],
      ringMode: mode,
      ringStepSeconds: stepSeconds,
      forward: forward && number ? { number, afterSeconds: forward.afterSeconds } : null,
    });
    await service.reconfigure();
    return c.body(null, 204);
  });

  // Missed calls leave "Zurückrufen" on this board: a person's own or a shared mailbox's.
  app.put("/callbacks", async (c) => {
    const parsed = callbacksSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    if (parsed.data.board && !ownerOf(c.get("loaded"), parsed.data.board)) {
      return c.json({ error: "Unbekanntes Board" }, 400);
    }
    await store.saveSettings({ ...(await store.settings()), callbackBoard: parsed.data.board });
    return c.body(null, 204);
  });

  // Direct numbers: each another IP phone at the Fritzbox with its own people.
  app.put("/lines", async (c) => {
    const parsed = linesSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig" }, 400);
    const settings = await store.settings();
    const known = new Set(c.get("loaded").company.employees.map((employee) => employee.id));
    const names = [settings.line?.username, ...parsed.data.lines.map((line) => line.username)];
    if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) {
      return c.json({ error: "Jeder Benutzername nur einmal" }, 400);
    }
    const extraLines = [];
    for (const line of parsed.data.lines) {
      if (!line.ring.every((id) => known.has(id)))
        return c.json({ error: "Unbekannte Person" }, 400);
      const before = settings.extraLines.find((other) => other.id === line.id);
      const password = line.password || before?.password;
      if (!password) return c.json({ error: `Kennwort für „${line.label}“ fehlt` }, 400);
      extraLines.push({ ...line, id: before?.id ?? newLineId(), password });
    }
    await store.saveSettings({ ...settings, extraLines });
    await service.reconfigure();
    return c.body(null, 204);
  });

  // Desk phones at the box: each gets a password once; the box hands it to the phone with its
  // provisioning file.
  app.put("/desks", async (c) => {
    const parsed = desksSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "MAC-Adresse oder Nummer ungültig" }, 400);
    const { desks } = parsed.data;
    const known = new Set(c.get("loaded").company.employees.map((employee) => employee.id));
    if (desks.some((desk) => desk.member && !known.has(desk.member))) {
      return c.json({ error: "Unbekannte Person" }, 400);
    }
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (!unique(desks.map((desk) => desk.extension)) || !unique(desks.map((desk) => desk.mac))) {
      return c.json({ error: "Jede Nummer und MAC-Adresse nur einmal" }, 400);
    }
    const settings = await store.settings();
    const deskPhones = desks.map((desk) => {
      const before = settings.deskPhones.find((other) => other.id === desk.id);
      return {
        ...desk,
        id: before?.id ?? newLineId(),
        password: before?.password ?? randomSecret(18),
      };
    });
    await store.saveSettings({ ...settings, deskPhones });
    await service.reconfigure();
    return c.body(null, 204);
  });

  app.put("/menu", async (c) => {
    const parsed = menuInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültiges Menü" }, 400);
    const settings = await store.settings();
    const { greeting, options } = parsed.data;
    if (greeting && !settings.sounds.some((sound) => sound.id === greeting)) {
      return c.json({ error: "Unbekannte Ansage" }, 400);
    }
    if (parsed.data.enabled && !greeting)
      return c.json({ error: "Das Menü braucht eine Ansage" }, 400);
    if (new Set(options.map((option) => option.digit)).size !== options.length) {
      return c.json({ error: "Jede Taste nur einmal" }, 400);
    }
    const known = new Set(c.get("loaded").company.employees.map((employee) => employee.id));
    if (!options.every((option) => option.members.every((id) => known.has(id)))) {
      return c.json({ error: "Unbekannte Person" }, 400);
    }
    await store.saveSettings({ ...settings, menu: parsed.data });
    await service.reconfigure();
    return c.body(null, 204);
  });

  app.put("/mailbox", async (c) => {
    const parsed = mailboxSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    const settings = await store.settings();
    const { greeting, deliverTo } = parsed.data;
    if (greeting && !settings.sounds.some((sound) => sound.id === greeting)) {
      return c.json({ error: "Unbekannte Ansage" }, 400);
    }
    const owner = deliverTo ? ownerOf(c.get("loaded"), deliverTo) : null;
    if (deliverTo && !owner) return c.json({ error: "Unbekanntes Postfach" }, 400);
    await store.saveSettings({
      ...settings,
      mailbox: {
        ...parsed.data,
        deliverTo: owner ? { accountId: owner.id, email: owner.email } : null,
      },
    });
    await service.reconfigure();
    return c.body(null, 204);
  });

  app.put("/hours", async (c) => {
    const parsed = hoursInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültige Zeiten" }, 400);
    const settings = await store.settings();
    const { greeting, open, closedDays } = parsed.data;
    if (greeting && !settings.sounds.some((sound) => sound.id === greeting)) {
      return c.json({ error: "Unbekannte Ansage" }, 400);
    }
    if (open.some((range) => range.from >= range.to)) {
      return c.json({ error: "„Bis“ muss nach „von“ liegen" }, 400);
    }
    const days = [...new Map(closedDays.map((entry) => [entry.day, entry])).values()].sort(
      (left, right) => left.day.localeCompare(right.day),
    );
    await store.saveSettings({ ...settings, hours: { ...parsed.data, closedDays: days } });
    await service.reconfigure();
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
