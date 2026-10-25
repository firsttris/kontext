/**
 * /api/calls: the calls one may see, a ticket into a channel's call, saying no to a ringing call,
 * and LiveKit's webhooks. Every change goes out on the live connection to whoever may see the
 * channel; a new direct call also rings on the others' devices (Web Push). A call that ended
 * leaves a line in its conversation ("Anruf · 5 Min", "Verpasster Anruf").
 */
import { Hono } from "hono";
import { type CallRecord, type Channel, canSee, type Message, type Viewer } from "../chat/chat";
import type { Hub } from "../live/hub";
import {
  applyRoomEvent,
  type Call,
  type Calls,
  callNotice,
  callRecord,
  joinSchema,
  participantMetadata,
  type RoomEvent,
  ringWho,
  roomOf,
} from "./calls";
import { joinToken, type LiveKitConfig, verifyWebhook } from "./livekit";

export type CallDeps = {
  livekit: LiveKitConfig;
  /** Where browsers connect; null: on Kontext's own address (Caddy passes /rtc on). */
  publicUrl: string | null;
  hub: Hub;
  channelOf: (id: string) => Promise<Channel | null>;
  viewerOf: (request: Request) => Promise<Viewer | null>;
  nameOf: (request: Request) => Promise<string>;
  notify?: (memberIds: string[], notice: ReturnType<typeof callNotice>) => Promise<void>;
  /** Every room event LiveKit reports, for others to follow (the phone calls' rooms). */
  onRoomEvent?: (event: RoomEvent) => void;
  /** Writes the line of an ended call into its conversation, as the caller. */
  postCall?: (channelId: string, authorId: string, call: CallRecord) => Promise<Message>;
};

/** The calls as they stand, changed only through `apply`. */
export const createCallState = () => {
  let calls: Calls = {};
  return {
    all: () => calls,
    apply: (event: RoomEvent) => {
      const result = applyRoomEvent(calls, event);
      calls = result.calls;
      return result;
    },
  };
};
export type CallState = ReturnType<typeof createCallState>;

export const createCallRoutes = (deps: CallDeps, state: CallState) => {
  const { hub, channelOf, viewerOf } = deps;
  const app = new Hono<{ Variables: { viewer: Viewer } }>();

  const publishCall = async (channelId: string, call: Call | null) => {
    const channel = await channelOf(channelId);
    if (!channel) return;
    hub.publish({ type: "call", channelId, call }, (viewer) => canSee(channel, viewer));
  };

  /** The sealed key of each running confidential call (end-to-end encrypted, LiveKit E2EE). */
  const callKeys = new Map<string, string>();

  /** Whom a call rang, and the caller's name (from the webhook: the name in their token). */
  const rung = new Map<string, { who: string[]; caller: string }>();

  const ring = async (call: Call, caller: string) => {
    const channel = await channelOf(call.channelId);
    const who = channel ? ringWho(channel, call) : [];
    if (!who.length) return;
    rung.set(call.channelId, { who, caller });
    await deps.notify?.(who, callNotice(call.channelId, caller, call.video));
  };

  /** The line in the conversation, and "Verpasster Anruf" on the devices it rang on. */
  const logEnded = async (call: Call, endedAt: string) => {
    const channel = await channelOf(call.channelId);
    const ringing = rung.get(call.channelId);
    rung.delete(call.channelId);
    if (!channel || !deps.postCall) return;
    const record = callRecord(call, endedAt, channel.kind);
    const message = await deps.postCall(channel.id, call.startedBy, record);
    hub.publish({ type: "message", channelId: channel.id, message }, (viewer) =>
      canSee(channel, viewer),
    );
    if (record.durationS === null && ringing) {
      await deps.notify?.(ringing.who, callNotice(channel.id, ringing.caller, call.video, true));
    }
  };

  /** Applies one room event; also used to rebuild the calls after a restart. */
  const receive = async (event: RoomEvent) => {
    const { channelId, started, ended } = state.apply(event);
    if (!channelId) return;
    const call = state.all()[channelId] ?? null;
    await publishCall(channelId, call);
    if (started && call) void ring(call, event.participant?.name ?? "").catch(() => undefined);
    if (ended) {
      // The next call gets a key of its own.
      callKeys.delete(channelId);
      await logEnded(ended.call, ended.at).catch(() => undefined);
    }
  };

  // LiveKit's webhooks: signed with the API secret, no session.
  app.post("/webhook", async (c) => {
    const body = await c.req.text();
    const event = await verifyWebhook(deps.livekit, body, c.req.header("authorization") ?? null);
    if (!event) return c.json({ error: "Ungültige Signatur" }, 401);
    deps.onRoomEvent?.(event);
    await receive(event);
    return c.body(null, 204);
  });

  app.use(async (c, next) => {
    const viewer = await viewerOf(c.req.raw);
    if (!viewer) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("viewer", viewer);
    await next();
  });

  const visibleChannel = async (id: string, viewer: Viewer) => {
    const channel = await channelOf(id);
    return channel && canSee(channel, viewer) ? channel : null;
  };

  app.get("/", async (c) => {
    const viewer = c.get("viewer");
    const visible = await Promise.all(
      Object.values(state.all()).map(async (call) =>
        (await visibleChannel(call.channelId, viewer)) ? call : null,
      ),
    );
    return c.json({ enabled: true, calls: visible.filter((call): call is Call => call !== null) });
  });

  app.post("/:channelId/join", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visibleChannel(c.req.param("channelId"), viewer);
    if (!channel) return c.json({ error: "Nicht gefunden" }, 404);
    const parsed = joinSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültig" }, 400);
    const token = await joinToken(deps.livekit, {
      identity: viewer.me,
      name: await deps.nameOf(c.req.raw),
      room: roomOf(channel.id),
      metadata: participantMetadata(parsed.data.video),
    });
    if (!channel.confidential) return c.json({ token, url: deps.publicUrl });
    // The first key sent stays: everyone in the call encrypts with the same one.
    if (parsed.data.sealedKey && !callKeys.has(channel.id)) {
      callKeys.set(channel.id, parsed.data.sealedKey);
    }
    return c.json({
      token,
      url: deps.publicUrl,
      confidential: true,
      sealedKey: callKeys.get(channel.id) ?? null,
    });
  });

  // Saying no: the caller hears it and stops ringing.
  app.post("/:channelId/decline", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visibleChannel(c.req.param("channelId"), viewer);
    if (!channel) return c.json({ error: "Nicht gefunden" }, 404);
    hub.publish({ type: "call-declined", channelId: channel.id, memberId: viewer.me }, (other) =>
      canSee(channel, other),
    );
    return c.body(null, 204);
  });

  return { app, receive };
};
