/**
 * Calls in the chat: every channel and direct conversation has its own LiveKit room, and whoever
 * may see the channel (`canSee`) may join it. A call exists while someone is in its room; the
 * server learns that from LiveKit's webhooks (participant_joined, participant_left,
 * room_finished – livekit/livekit pkg/telemetry/events.go) and keeps nothing on disk. Pure.
 */
import { z } from "zod";
import type { CallRecord, Channel } from "../chat/chat";

export type Call = {
  channelId: string;
  /** Who opened the room: the caller of a direct call. */
  startedBy: string;
  startedAt: string;
  /** Asked for with camera; the others are offered to answer with camera too. */
  video: boolean;
  /** Who is in the room now, by personal account id (the LiveKit identity). */
  participants: string[];
  /** Everyone who was in it at some point, the caller first. */
  everyone: string[];
  /** When a second person came: the call was answered. */
  answeredAt: string | null;
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

type Applied = {
  calls: Calls;
  /** The channel whose call changed; null when nothing did. */
  channelId: string | null;
  /** This event opened the call: the moment to ring. */
  started: boolean;
  /** This event ended the call: it as it was, and when it ended. */
  ended: { call: Call; at: string } | null;
};

const joined = (
  call: Call | undefined,
  channelId: string,
  identity: string,
  event: RoomEvent,
  at: string,
): Call => {
  if (!call) {
    return {
      channelId,
      startedBy: identity,
      startedAt: at,
      video: videoOf(event.participant?.metadata),
      participants: [identity],
      everyone: [identity],
      answeredAt: null,
    };
  }
  const everyone = call.everyone.includes(identity) ? call.everyone : [...call.everyone, identity];
  return {
    ...call,
    participants: [...call.participants, identity],
    everyone,
    answeredAt: call.answeredAt ?? (everyone.length > 1 ? at : null),
  };
};

/** The calls after one webhook: what changed, and whether a call began or ended. */
export const applyRoomEvent = (calls: Calls, event: RoomEvent, now = new Date()): Applied => {
  const channelId = channelOfRoom(event.room?.name ?? "");
  const unchanged: Applied = { calls, channelId: null, started: false, ended: null };
  if (!channelId) return unchanged;
  const call = calls[channelId];
  const identity = event.participant?.identity;
  const at = timeOf(event, now);
  const end = (ending: Call): Applied => ({
    calls: without(calls, channelId),
    channelId,
    started: false,
    ended: { call: ending, at },
  });

  if (event.event === "room_finished") return call ? end(call) : unchanged;
  if (event.event === "participant_joined" && identity) {
    if (call?.participants.includes(identity)) return unchanged;
    const next = joined(call, channelId, identity, event, at);
    return { calls: { ...calls, [channelId]: next }, channelId, started: !call, ended: null };
  }
  if (event.event === "participant_left" && identity && call?.participants.includes(identity)) {
    const participants = call.participants.filter((id) => id !== identity);
    if (!participants.length) return end(call);
    return {
      calls: { ...calls, [channelId]: { ...call, participants } },
      channelId,
      started: false,
      ended: null,
    };
  }
  return unchanged;
};

/**
 * The line a call leaves in its conversation. A direct call counts from the answer and is
 * "missed" without one; a meeting counts from its start.
 */
export const callRecord = (call: Call, endedAt: string, kind: Channel["kind"]): CallRecord => {
  const from = kind === "direct" ? call.answeredAt : call.startedAt;
  return {
    video: call.video,
    meeting: kind !== "direct",
    participants: call.everyone,
    durationS: from
      ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(from).getTime()) / 1000))
      : null,
  };
};

/**
 * Who hears a new call ring: in a direct conversation everyone else in it. In channels a call is
 * a meeting one joins from the conversation; ringing a whole company would only disturb.
 */
export const ringWho = (channel: Pick<Channel, "kind" | "members">, call: Call): string[] =>
  channel.kind === "direct" ? channel.members.filter((id) => !call.participants.includes(id)) : [];

/**
 * The notification for a ringing call, also with Kontext closed (Web Push); a missed call
 * replaces it (same tag).
 */
export const callNotice = (channelId: string, caller: string, video: boolean, missed = false) => ({
  title: caller,
  body: missed ? "Verpasster Anruf" : video ? "Videoanruf" : "Anruf",
  url: `/chat?channel=${encodeURIComponent(channelId)}`,
  tag: `call-${channelId}`,
});
