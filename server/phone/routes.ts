/**
 * /api/phone: the calls one sees, taking a ringing call, dialling, hanging up and notes – and the
 * boxes' own door: pairing with a code (POST /box/pair) and their WebSocket (GET /box, with the
 * token from pairing). A ticket into a phone call's LiveKit room comes with answer and dial.
 */
import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { z } from "zod";
import { participantMetadata } from "../calls/calls";
import { joinToken, type LiveKitConfig } from "../calls/livekit";
import type { Viewer } from "../chat/chat";
import { dialSchema, noteSchema, type PhoneCall, phoneRoom } from "./phone";
import { fromBoxSchema, parseMessage } from "./protocol";
import type { PhoneService, Problem } from "./service";
import type { PhoneStore } from "./store";

export type PhoneRouteDeps = {
  service: PhoneService;
  store: PhoneStore;
  livekit: LiveKitConfig;
  publicUrl: string | null;
  viewerOf: (request: Request) => Promise<Viewer | null>;
  nameOf: (request: Request) => Promise<string>;
  upgradeWebSocket: UpgradeWebSocket;
};

const STATUS: Record<Problem, 400 | 403 | 404 | 409 | 503> = {
  "not-allowed": 403,
  "not-found": 404,
  busy: 409,
  offline: 503,
  "bad-number": 400,
};

const MESSAGES: Record<Problem, string> = {
  "not-allowed": "Keine Berechtigung",
  "not-found": "Nicht gefunden",
  busy: "Schon angenommen",
  offline: "Telefonbox nicht verbunden",
  "bad-number": "Keine gültige Nummer",
};

const pairSchema = z.object({ code: z.string().trim().min(4).max(20) });

const bearer = (request: Request) =>
  request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";

export const createPhoneRoutes = (deps: PhoneRouteDeps) => {
  const { service, store } = deps;
  const app = new Hono<{ Variables: { viewer: Viewer } }>();

  // The boxes: pairing once with the code from the Firmenverwaltung, then their token.
  app.post("/box/pair", async (c) => {
    const parsed = pairSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Code fehlt" }, 400);
    const paired = await store.pair(parsed.data.code);
    return paired ? c.json(paired) : c.json({ error: "Code ungültig oder abgelaufen" }, 403);
  });

  app.get(
    "/box",
    async (c, next) => {
      const box = await store.boxOfToken(bearer(c.req.raw));
      if (!box) return c.json({ error: "Unbekannte Box" }, 401);
      c.set("viewer", { me: `box:${box.id}`, accountIds: [] });
      await next();
    },
    deps.upgradeWebSocket((c) => {
      const boxId = c.get("viewer").me.slice("box:".length);
      let connection: ReturnType<PhoneService["connect"]> | null = null;
      return {
        onOpen: (_event, ws) => {
          connection = service.connect(boxId, (message) => ws.send(JSON.stringify(message)));
        },
        onMessage: (event) => {
          const message = parseMessage(fromBoxSchema, String(event.data));
          if (message) void connection?.receive(message).catch(() => undefined);
        },
        onClose: () => connection?.close(),
      };
    }),
  );

  app.use(async (c, next) => {
    const viewer = await deps.viewerOf(c.req.raw);
    if (!viewer) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("viewer", viewer);
    await next();
  });

  /** The answer for a call one is now in: the call and a ticket into its room. */
  const withTicket = async (request: Request, me: string, call: PhoneCall) => ({
    call,
    url: deps.publicUrl,
    token: await joinToken(deps.livekit, {
      identity: me,
      name: await deps.nameOf(request),
      room: phoneRoom(call.room!),
      metadata: participantMetadata(false),
    }),
  });

  const problem = (result: PhoneCall | Problem): result is Problem => typeof result === "string";

  app.get("/", async (c) => {
    const me = c.get("viewer").me;
    return c.json({
      enabled: true,
      allowed: await service.allowed(me),
      online: service.online().length > 0,
      calls: await service.callsOf(me),
    });
  });

  app.post("/dial", async (c) => {
    const me = c.get("viewer").me;
    const parsed = dialSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: MESSAGES["bad-number"] }, 400);
    const result = await service.dial(me, parsed.data.number);
    if (problem(result)) return c.json({ error: MESSAGES[result] }, STATUS[result]);
    return c.json(await withTicket(c.req.raw, me, result));
  });

  app.post("/calls/:id/answer", async (c) => {
    const me = c.get("viewer").me;
    const result = await service.answer(c.req.param("id"), me);
    if (problem(result)) return c.json({ error: MESSAGES[result] }, STATUS[result]);
    return c.json(await withTicket(c.req.raw, me, result));
  });

  app.post("/calls/:id/hangup", async (c) => {
    const result = await service.hangup(c.req.param("id"), c.get("viewer").me);
    if (problem(result)) return c.json({ error: MESSAGES[result] }, STATUS[result]);
    return c.body(null, 204);
  });

  app.put("/calls/:id/note", async (c) => {
    const parsed = noteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    const result = await service.note(c.req.param("id"), c.get("viewer").me, parsed.data.note);
    if (problem(result)) return c.json({ error: MESSAGES[result] }, STATUS[result]);
    return c.json({ call: result });
  });

  return app;
};
