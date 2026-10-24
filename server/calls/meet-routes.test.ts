// @vitest-environment node
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../chat/chat";
import { participantMetadata, roomOf } from "./calls";
import type { LiveKitConfig } from "./livekit";
import { createMeetRoutes } from "./meet-routes";
import { hostPresent, isGuest, meetingIdSchema, meetingKey, newMeetingId } from "./meetings";
import { createCallState } from "./routes";

const livekit: LiveKitConfig = {
  url: "http://livekit.test",
  apiKey: "kontext",
  apiSecret: "a-test-secret-that-is-long-enough-0123",
};

const ID = "AbCdEfGhIjKlMnOpQrSt_-";

const setup = () => {
  const state = createCallState();
  const app = createMeetRoutes(
    {
      livekit,
      publicUrl: null,
      origin: "https://kontext.firma.de",
      viewerOf: async (request): Promise<Viewer | null> => {
        const me = request.headers.get("x-who");
        return me ? { me, accountIds: [me] } : null;
      },
      nameOf: async (request) => `Name of ${request.headers.get("x-who")}`,
    },
    state,
  );
  const call = (path: string, who: string | null, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { ...(who ? { "x-who": who } : {}), "content-type": "application/json" },
    });
  const arrive = (identity: string) =>
    state.apply({
      event: "participant_joined",
      room: { name: roomOf(meetingKey(ID)) },
      participant: { identity, metadata: participantMetadata(true) },
    });
  return { call, arrive };
};

describe("meeting ids", () => {
  it("are long, random and URL-safe", () => {
    const id = newMeetingId();
    expect(meetingIdSchema.safeParse(id).success).toBe(true);
    expect(id).not.toBe(newMeetingId());
    expect(meetingIdSchema.safeParse("../etc").success).toBe(false);
    expect(meetingIdSchema.safeParse("short").success).toBe(false);
  });
});

describe("/api/meet", () => {
  it("makes a meeting link for a signed-in person only", async () => {
    const { call } = setup();
    const created = await call("/", "jonas", { method: "POST" });
    const { id, url } = (await created.json()) as { id: string; url: string };
    expect(url).toBe(`https://kontext.firma.de/meet/${id}`);
    expect((await call("/", null, { method: "POST" })).status).toBe(401);
  });

  it("lets a colleague in at any time, as themselves", async () => {
    const { call } = setup();
    const response = await call(`/${ID}/join`, "jonas", { method: "POST", body: "{}" });
    const { token, name } = (await response.json()) as { token: string; name: string };
    expect(name).toBe("Name of jonas");
    expect(decodeJwt(token)).toMatchObject({
      sub: "jonas",
      video: { room: roomOf(meetingKey(ID)), roomJoin: true },
    });
  });

  it("keeps guests waiting until someone of the company is there", async () => {
    const { call, arrive } = setup();
    const join = () =>
      call(`/${ID}/join`, null, {
        method: "POST",
        body: JSON.stringify({ name: "Frau Hoffmann" }),
      });
    expect(await (await call(`/${ID}`, null)).json()).toEqual({ running: false, signedIn: false });
    expect((await join()).status).toBe(409);

    arrive("guest-early");
    expect((await join()).status).toBe(409);

    arrive("jonas");
    expect((await (await call(`/${ID}`, null)).json()).running).toBe(true);
    const response = await join();
    expect(response.status).toBe(200);
    const { token, name } = (await response.json()) as { token: string; name: string };
    expect(name).toBe("Frau Hoffmann");
    const claims = decodeJwt(token);
    expect(isGuest(String(claims.sub))).toBe(true);
    expect(claims).toMatchObject({
      name: "Frau Hoffmann",
      video: { room: roomOf(meetingKey(ID)) },
    });
  });

  it("asks a guest for a name and refuses broken ids", async () => {
    const { call, arrive } = setup();
    arrive("jonas");
    const noName = await call(`/${ID}/join`, null, { method: "POST", body: '{"name":"  "}' });
    expect(noName.status).toBe(400);
    expect((await call("/x/join", null, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call("/x", null)).status).toBe(404);
  });
});

describe("hostPresent", () => {
  it("counts only people of the company", () => {
    const calls = {
      [meetingKey(ID)]: {
        channelId: meetingKey(ID),
        startedBy: "guest-1",
        startedAt: "",
        video: true,
        participants: ["guest-1"],
        everyone: ["guest-1"],
        answeredAt: null,
      },
    };
    expect(hostPresent(calls, ID)).toBe(false);
    expect(hostPresent({}, ID)).toBe(false);
  });
});
