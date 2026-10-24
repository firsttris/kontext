/**
 * Calls in the chat: every channel and direct conversation has its own LiveKit room, and whoever
 * may see the channel (`canSee`) may join it. A call exists while someone is in its room; the
 * server learns that from LiveKit's webhooks (participant_joined, participant_left,
 * room_finished – livekit/livekit pkg/telemetry/events.go) and keeps nothing on disk. Pure.
 */
import { z } from "zod";
import type { Channel } from "../chat/chat";

export type Call = {
  channelId: string;
  /** Who opened the room: the caller of a direct call. */
  startedBy: string;
  startedAt: string;
  /** Asked for with camera; the others are offered to answer with camera too. */
  video: boolean;
  /** Who is in the room now, by personal account id (the LiveKit identity). */
  participants: string[];
};

/** All calls that are running, by channel. */
export type Calls = Record<string, Call>;

/** Rooms of Kontext carry a prefix, so a LiveKit shared with something else stays apart. */
const ROOM_PREFIX = "kontext-";
export const roomOf = (channelId: string) => `${ROOM_PREFIX}${channelId}`;
export const channelOfRoom = (room: string): string | null =>
  room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) || null : null;

export const joinSchema = z.object({ video: z.boolean().default(false) });

/** What a token carries for the webhooks (LiveKit passes participant metadata through). */
export const participantMetadata = (video: boolean) => JSON.stringify({ video });
const videoOf = (metadata: string | undefined) => {
  try {
    return Boolean((JSON.parse(metadata ?? "{}") as { video?: unknown }).video);
  } catch {
    return false;
  }
};

/** The parts of a LiveKit webhook (protocol's WebhookEvent as JSON) that matter here. */
export type RoomEvent = {
  event: string;
  room?: { name?: string };
  participant?: { identity?: string; name?: string; metadata?: string };
  /** Seconds since 1970, as protobuf's JSON writes an int64: a string. */
  createdAt?: string | number;
};

const timeOf = (event: RoomEvent, now: Date) =>
  event.createdAt ? new Date(Number(event.createdAt) * 1000).toISOString() : now.toISOString();

const without = (calls: Calls, channelId: string): Calls =>
  Object.fromEntries(Object.entries(calls).filter(([id]) => id !== channelId));

/**
 * The calls after one webhook, and the channel whose call changed (null when nothing did).
 * `started` is true when this event opened the call – the moment to ring.
 */
export const applyRoomEvent = (
  calls: Calls,
  event: RoomEvent,
  now = new Date(),
): { calls: Calls; channelId: string | null; started: boolean } => {
  const channelId = channelOfRoom(event.room?.name ?? "");
  const unchanged = { calls, channelId: null, started: false };
  if (!channelId) return unchanged;
  const call = calls[channelId];
  const identity = event.participant?.identity;

  if (event.event === "room_finished") {
    return call ? { calls: without(calls, channelId), channelId, started: false } : unchanged;
  }
  if (event.event === "participant_joined" && identity) {
    if (call?.participants.includes(identity)) return unchanged;
    const next: Call = call
      ? { ...call, participants: [...call.participants, identity] }
      : {
          channelId,
          startedBy: identity,
          startedAt: timeOf(event, now),
          video: videoOf(event.participant?.metadata),
          participants: [identity],
        };
    return { calls: { ...calls, [channelId]: next }, channelId, started: !call };
  }
  if (event.event === "participant_left" && identity && call) {
    const participants = call.participants.filter((id) => id !== identity);
    return {
      calls: participants.length
        ? { ...calls, [channelId]: { ...call, participants } }
        : without(calls, channelId),
      channelId,
      started: false,
    };
  }
  return unchanged;
};

/**
 * Who hears a new call ring: in a direct conversation everyone else in it. In channels a call is
 * a meeting one joins from the conversation; ringing a whole company would only disturb.
 */
export const ringWho = (channel: Pick<Channel, "kind" | "members">, call: Call): string[] =>
  channel.kind === "direct" ? channel.members.filter((id) => !call.participants.includes(id)) : [];

/** The notification for a ringing call, also with Kontext closed (Web Push). */
export const callNotice = (channelId: string, caller: string, video: boolean) => ({
  title: caller,
  body: video ? "Videoanruf" : "Anruf",
  url: `/chat?channel=${encodeURIComponent(channelId)}`,
  tag: `call-${channelId}`,
});
