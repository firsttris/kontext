/**
 * Calls in the chat as the app shows them: which call rings here, how long one has been talking,
 * and what the caller of a direct call is waiting for. Pure; what a call is: server/calls/calls.ts.
 */

import { m } from "@/paraglide/messages";
import type { Call } from "../../server/calls/calls";
import type { CallRecord, Channel } from "../../server/chat/chat";
import { firstName } from "./chat";

export type { Call, CallRecord };

/** After this long without an answer the caller gives up ("Keine Antwort"). */
export const RING_TIMEOUT_MS = 45_000;

/**
 * The call that rings for me: one in a direct conversation of mine that someone else opened, that
 * I am not in and have not said no to. The oldest first, so a second call waits its turn.
 */
export const ringingCall = (
  calls: Call[],
  channels: Pick<Channel, "id" | "kind" | "members">[],
  me: string,
  declined: string[],
): Call | null =>
  [...calls]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .find((call) => {
      const channel = channels.find((candidate) => candidate.id === call.channelId);
      return (
        channel?.kind === "direct" &&
        channel.members.includes(me) &&
        call.startedBy !== me &&
        !call.participants.includes(me) &&
        !declined.includes(call.channelId)
      );
    }) ?? null;

/** "0:07", "12:40", "1:02:03". */
export const callDuration = (startedAt: string, now: Date): string => {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

/**
 * Where my own call stands in a direct conversation: still ringing (nobody else came yet), turned
 * down by everyone I called, unanswered for too long, or talking. Calls in channels are meetings
 * and simply run.
 */
export type CallerState = "ringing" | "declined" | "unanswered" | "talking";

export const callerState = ({
  kind,
  others,
  joined,
  declinedBy,
  ringingFor,
}: {
  kind: Channel["kind"];
  /** The other members of the conversation. */
  others: string[];
  /** Who else is in the call now or was in it since I joined. */
  joined: string[];
  declinedBy: string[];
  ringingFor: number;
}): CallerState => {
  if (kind !== "direct" || joined.length > 0) return "talking";
  if (others.length > 0 && others.every((id) => declinedBy.includes(id))) return "declined";
  return ringingFor >= RING_TIMEOUT_MS ? "unanswered" : "ringing";
};

/** Whom a call rings for, by first name: "Anna", "Anna, Max". */
export const firstNameList = (ids: string[], nameOf: (id: string) => string): string =>
  ids.map((id) => firstName(nameOf(id))).join(", ");

/** How long a call ran, roughly: "unter 1 Min", "12 Min", "1 Std 5 Min". */
export const roughDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return m.call_under_minute();
  if (minutes < 60) return m.call_minutes({ minutes });
  return m.call_hours({ hours: Math.floor(minutes / 60), minutes: minutes % 60 });
};

/** The line an ended call leaves in its conversation. */
export const callLine = (call: CallRecord): string => {
  if (call.durationS === null) return m.call_line_missed();
  const duration = roughDuration(call.durationS);
  if (call.meeting) return m.call_line_meeting({ count: call.participants.length, duration });
  return call.video ? m.call_line_video({ duration }) : m.call_line_audio({ duration });
};
