// @vitest-environment node
import { decodeJwt, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { Channel, Message, Viewer } from "../chat/chat";
import { createHub, type LiveEvent } from "../live/hub";
import { participantMetadata, type RoomEvent, roomOf } from "./calls";
import { type LiveKitConfig, verifyWebhook } from "./livekit";
import { createCallRoutes, createCallState } from "./routes";

const livekit: LiveKitConfig = {
  url: "http://livekit.test",
  apiKey: "kontext",
  apiSecret: "a-test-secret-that-is-long-enough-0123",
};

const channel = (id: string, kind: Channel["kind"], members: string[]): Channel => ({
  id,
  kind,
  confidential: false,
  name: kind === "channel" ? id : null,
  accountId: null,
  members,
  createdBy: members[0] ?? "jonas",
  createdAt: "",
  lastMessageAt: null,
});

const CHANNELS = [
  channel("dm", "direct", ["jonas", "anna"]),
  channel("baustelle", "channel", ["jonas", "max"]),
];

/** The person in the "x-who" header; the session check of the real server is not under test. */
const setup = () => {
  const hub = createHub();
  const heard: { who: string; event: LiveEvent }[] = [];
  for (const me of ["jonas", "anna", "max"]) {
    hub.subscribe({ me, accountIds: [me] }, (event) => heard.push({ who: me, event }));
  }
  const rung: { who: string[]; title: string; body: string }[] = [];
  const posted: Message[] = [];
  const { app, receive } = createCallRoutes(
    {
      livekit,
      publicUrl: null,
      hub,
      channelOf: async (id) => CHANNELS.find((c) => c.id === id) ?? null,
      viewerOf: async (request): Promise<Viewer | null> => {
        const me = request.headers.get("x-who");
        return me ? { me, accountIds: [me] } : null;
      },
      nameOf: async (request) => `Name of ${request.headers.get("x-who")}`,
      notify: async (who, notice) =>
        void rung.push({ who, title: notice.title, body: notice.body }),
      postCall: async (channelId, authorId, call) => {
        const message: Message = {
          id: `m${posted.length + 1}`,
          channelId,
          authorId,
          text: "",
          mentions: [],
          files: [],
          cards: [],
          createdAt: new Date().toISOString(),
          editedAt: null,
          deleted: false,
          parentId: null,
          reactions: [],
          replies: null,
          call,
        };
        posted.push(message);
        return message;
      },
    },
    createCallState(),
  );
  const call = (path: string, who: string | null, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...(who ? { "x-who": who } : {}),
        "content-type": "application/json",
      },
    });
  return { call, receive, heard, rung, posted };
};

/** A webhook as LiveKit signs it: a JWT with the body's SHA-256. */
const signedWebhook = async (event: RoomEvent, secret = livekit.apiSecret) => {
  const body = JSON.stringify(event);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const sha256 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const token = await new SignJWT({ sha256 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(livekit.apiKey)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  return { body, token };
};

const joined = (identity: string, room = roomOf("dm"), name = identity): RoomEvent => ({
  event: "participant_joined",
  room: { name: room },
  participant: { identity, name, metadata: participantMetadata(true) },
});

describe("/api/calls", () => {
  it("gives a ticket into the room of a channel one sees", async () => {
    const { call } = setup();
    const response = await call("/dm/join", "jonas", {
      method: "POST",
      body: JSON.stringify({ video: true }),
    });
    expect(response.status).toBe(200);
    const { token, url } = (await response.json()) as { token: string; url: string | null };
    expect(url).toBeNull();
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({
      iss: "kontext",
      sub: "jonas",
      name: "Name of jonas",
      metadata: participantMetadata(true),
      video: { room: roomOf("dm"), roomJoin: true, canPublish: true, canSubscribe: true },
    });
  });

  it("keeps others out of a conversation and asks for a sign-in", async () => {
    const { call } = setup();
    expect((await call("/dm/join", "max", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call("/nowhere/join", "max", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call("/dm/join", null, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await call("/", null)).status).toBe(401);
  });

  it("follows the webhooks: rings the other side, tells who sees it, and ends", async () => {
    const { call, heard, rung } = setup();
    const webhook = async (event: RoomEvent) => {
      const { body, token } = await signedWebhook(event);
      return postWebhook(call, body, token);
    };
    expect((await webhook(joined("jonas", roomOf("dm"), "Jonas Weber"))).status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rung).toEqual([{ who: ["anna"], title: "Jonas Weber", body: "Videoanruf" }]);
    const told = heard.filter(({ event }) => event.type === "call").map(({ who }) => who);
    expect(told.sort()).toEqual(["anna", "jonas"]);

    const listed = await (await call("/", "anna")).json();
    expect(listed).toMatchObject({ enabled: true, calls: [{ channelId: "dm", video: true }] });
    expect((await (await call("/", "max")).json()).calls).toEqual([]);

    await webhook(joined("anna"));
    await webhook({ event: "room_finished", room: { name: roomOf("dm") } });
    const last = heard.filter(({ event }) => event.type === "call").at(-1)?.event;
    expect(last).toEqual({ type: "call", channelId: "dm", call: null });
    expect(rung).toHaveLength(1);
  });

  it("refuses webhooks that LiveKit did not sign or whose body was changed", async () => {
    const { call } = setup();
    const event = joined("jonas");
    const forged = await signedWebhook(event, "another-secret-of-enough-length-0123456");
    const post = (body: string, authorization?: string) => postWebhook(call, body, authorization);
    expect((await post(forged.body, forged.token)).status).toBe(401);
    const real = await signedWebhook(event);
    expect((await post(JSON.stringify(joined("max")), real.token)).status).toBe(401);
    expect((await post(real.body)).status).toBe(401);
  });

  it("does not ring for a meeting in a channel", async () => {
    const { call, rung } = setup();
    const { body, token } = await signedWebhook(joined("jonas", roomOf("baustelle")));
    await postWebhook(call, body, token);
    expect(rung).toEqual([]);
  });

  it("tells the caller who said no", async () => {
    const { call, heard } = setup();
    expect((await call("/dm/decline", "anna", { method: "POST" })).status).toBe(204);
    const declined = heard.filter(({ event }) => event.type === "call-declined");
    expect(declined.map(({ who }) => who).sort()).toEqual(["anna", "jonas"]);
    expect(declined[0]?.event).toEqual({
      type: "call-declined",
      channelId: "dm",
      memberId: "anna",
    });
    expect((await call("/dm/decline", "max", { method: "POST" })).status).toBe(404);
  });
});

/** POSTs a webhook with LiveKit's "Authorization" header (the raw JWT, no "Bearer"). */
const postWebhook = (
  call: (path: string, who: string | null, init?: RequestInit) => Response | Promise<Response>,
  body: string,
  authorization?: string,
) =>
  call("/webhook", null, {
    method: "POST",
    body,
    headers: authorization ? { authorization } : {},
  });

describe("the line a call leaves", () => {
  const event = (
    kind: string,
    identity: string,
    seconds: number,
    room = roomOf("dm"),
  ): RoomEvent => ({
    event: kind,
    room: { name: room },
    participant: { identity, name: identity, metadata: participantMetadata(false) },
    createdAt: String(1767225600 + seconds),
  });

  it("writes how long an answered call ran and tells who sees the conversation", async () => {
    const { receive, posted, heard, rung } = setup();
    await receive(event("participant_joined", "jonas", 0));
    await receive(event("participant_joined", "anna", 10));
    await receive(event("participant_left", "anna", 310));
    await receive(event("participant_left", "jonas", 311));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      channelId: "dm",
      authorId: "jonas",
      call: { video: false, meeting: false, participants: ["jonas", "anna"], durationS: 301 },
    });
    const told = heard.filter(({ event }) => event.type === "message").map(({ who }) => who);
    expect(told.sort()).toEqual(["anna", "jonas"]);
    expect(rung.map(({ body }) => body)).toEqual(["Anruf"]);
  });

  it("writes a missed call and replaces the ringing notification", async () => {
    const { receive, posted, rung } = setup();
    await receive(event("participant_joined", "jonas", 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await receive(event("participant_left", "jonas", 45));
    expect(posted[0]?.call).toMatchObject({ durationS: null, participants: ["jonas"] });
    expect(rung.map(({ who, body }) => [who, body])).toEqual([
      [["anna"], "Anruf"],
      [["anna"], "Verpasster Anruf"],
    ]);
  });

  it("writes a meeting in a channel from its start", async () => {
    const { receive, posted, rung } = setup();
    await receive(event("participant_joined", "jonas", 0, roomOf("baustelle")));
    await receive(event("participant_left", "jonas", 60, roomOf("baustelle")));
    expect(posted[0]).toMatchObject({
      channelId: "baustelle",
      call: { meeting: true, durationS: 60 },
    });
    expect(rung).toEqual([]);
  });
});

describe("verifyWebhook", () => {
  it("also takes the token after Bearer", async () => {
    const { body, token } = await signedWebhook(joined("jonas"));
    expect(await verifyWebhook(livekit, body, `Bearer ${token}`)).toMatchObject({
      event: "participant_joined",
    });
  });
});
