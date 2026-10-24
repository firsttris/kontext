// @vitest-environment node
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { currentRoomEvents, type LiveKitConfig } from "./livekit";

const livekit: LiveKitConfig = {
  url: "http://livekit.test",
  apiKey: "kontext",
  apiSecret: "a-test-secret-that-is-long-enough-0123",
};

describe("currentRoomEvents", () => {
  it("lists who is in each room, the earliest first, with a token per request", async () => {
    const asked: { path: string; body: unknown; grant: unknown }[] = [];
    const fetcher = async (input: string, init?: RequestInit) => {
      const token = String(new Headers(init?.headers).get("authorization")).replace("Bearer ", "");
      const path = new URL(input).pathname;
      const body = JSON.parse(String(init?.body));
      asked.push({ path, body, grant: decodeJwt(token).video });
      if (path.endsWith("/ListRooms")) {
        return Response.json({ rooms: [{ name: "kontext-dm" }] });
      }
      return Response.json({
        participants: [
          { identity: "anna", joined_at: "1767225660" },
          { identity: "jonas", metadata: '{"video":true}', joined_at: "1767225600" },
        ],
      });
    };
    const events = await currentRoomEvents(livekit, fetcher);
    expect(events.map((event) => event.participant?.identity)).toEqual(["jonas", "anna"]);
    expect(events[0]).toEqual({
      event: "participant_joined",
      room: { name: "kontext-dm" },
      participant: { identity: "jonas", metadata: '{"video":true}' },
      createdAt: "1767225600",
    });
    expect(asked).toEqual([
      { path: "/twirp/livekit.RoomService/ListRooms", body: {}, grant: { roomList: true } },
      {
        path: "/twirp/livekit.RoomService/ListParticipants",
        body: { room: "kontext-dm" },
        grant: { roomAdmin: true, room: "kontext-dm" },
      },
    ]);
  });

  it("says so when LiveKit refuses", async () => {
    const fetcher = async () => new Response("no", { status: 401 });
    await expect(currentRoomEvents(livekit, fetcher)).rejects.toThrow("ListRooms: 401");
  });
});
