// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyRoomEvent,
  type Calls,
  callNotice,
  channelOfRoom,
  participantMetadata,
  type RoomEvent,
  ringWho,
  roomOf,
} from "./calls";

const joined = (identity: string, video = false, room = roomOf("c1")): RoomEvent => ({
  event: "participant_joined",
  room: { name: room },
  participant: { identity, metadata: participantMetadata(video) },
  createdAt: "1767225600",
});
const left = (identity: string): RoomEvent => ({
  event: "participant_left",
  room: { name: roomOf("c1") },
  participant: { identity },
});

describe("rooms", () => {
  it("names a room after its channel and back", () => {
    expect(channelOfRoom(roomOf("c42"))).toBe("c42");
    expect(channelOfRoom("someone-elses-room")).toBeNull();
    expect(channelOfRoom("kontext-")).toBeNull();
  });
});

describe("applyRoomEvent", () => {
  it("opens a call with the first one in the room, with camera as they asked", () => {
    const result = applyRoomEvent({}, joined("jonas", true));
    expect(result).toMatchObject({ channelId: "c1", started: true });
    expect(result.calls.c1).toEqual({
      channelId: "c1",
      startedBy: "jonas",
      startedAt: "2026-01-01T00:00:00.000Z",
      video: true,
      participants: ["jonas"],
    });
  });

  it("adds who joins later without starting the call again", () => {
    const { calls } = applyRoomEvent({}, joined("jonas"));
    const result = applyRoomEvent(calls, joined("anna", true));
    expect(result.started).toBe(false);
    expect(result.calls.c1).toMatchObject({ startedBy: "jonas", video: false });
    expect(result.calls.c1?.participants).toEqual(["jonas", "anna"]);
  });

  it("ignores a second join of the same person (another tab)", () => {
    const { calls } = applyRoomEvent({}, joined("jonas"));
    expect(applyRoomEvent(calls, joined("jonas")).channelId).toBeNull();
  });

  it("ends the call when the last one leaves or the room closes", () => {
    let calls: Calls = applyRoomEvent({}, joined("jonas")).calls;
    calls = applyRoomEvent(calls, joined("anna")).calls;
    calls = applyRoomEvent(calls, left("jonas")).calls;
    expect(calls.c1?.participants).toEqual(["anna"]);
    const last = applyRoomEvent(calls, left("anna"));
    expect(last).toMatchObject({ channelId: "c1", started: false });
    expect(last.calls).toEqual({});
    const finished = applyRoomEvent(calls, {
      event: "room_finished",
      room: { name: roomOf("c1") },
    });
    expect(finished.calls).toEqual({});
  });

  it("leaves rooms of others and unknown events alone", () => {
    const calls = applyRoomEvent({}, joined("jonas")).calls;
    expect(applyRoomEvent(calls, joined("x", false, "other-room")).calls).toBe(calls);
    expect(
      applyRoomEvent(calls, { event: "track_published", room: { name: roomOf("c1") } }),
    ).toEqual({ calls, channelId: null, started: false });
    expect(applyRoomEvent({}, left("jonas")).channelId).toBeNull();
  });

  it("reads broken metadata as a call without camera", () => {
    const event = { ...joined("jonas"), participant: { identity: "jonas", metadata: "{" } };
    expect(applyRoomEvent({}, event).calls.c1?.video).toBe(false);
  });
});

describe("ringWho", () => {
  const call = {
    channelId: "c1",
    startedBy: "jonas",
    startedAt: "",
    video: false,
    participants: ["jonas"],
  };

  it("rings the others of a direct conversation", () => {
    expect(ringWho({ kind: "direct", members: ["jonas", "anna", "max"] }, call)).toEqual([
      "anna",
      "max",
    ]);
  });

  it("rings nobody for a meeting in a channel", () => {
    expect(ringWho({ kind: "channel", members: ["jonas", "anna"] }, call)).toEqual([]);
    expect(ringWho({ kind: "team", members: [] }, call)).toEqual([]);
  });
});

describe("callNotice", () => {
  it("opens the conversation and replaces itself per channel", () => {
    expect(callNotice("c 1", "Jonas Weber", true)).toEqual({
      title: "Jonas Weber",
      body: "Videoanruf",
      url: "/chat?channel=c%201",
      tag: "call-c 1",
    });
  });
});
