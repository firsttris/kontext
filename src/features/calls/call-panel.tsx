/**
 * The call one is in (LiveKit, loaded only when a call starts): a panel at the bottom right on a
 * desktop that can be made large, the whole screen on a phone. While a direct call rings, the
 * caller sees whom it rings for; a "no" from everyone or no answer ends it.
 */
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useRemoteParticipants,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Maximize2, Minimize2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useChannels } from "@/features/chat/queries";
import { useChatNames } from "@/features/chat/use-chat-names";
import { callDuration, callerState, firstNameList } from "@/lib/calls";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { CallControls } from "./call-controls";
import { type ActiveCall, leaveCall, useCallStore } from "./call-store";
import { CallTiles } from "./call-tiles";
import { useCall } from "./queries";
import { startRinging } from "./ringtone";

/** How long "Abgelehnt" or "Keine Antwort" stays before the panel closes. */
const ENDING_MS = 2500;

/** Seconds that pass, for the duration and for how long it has rung. */
const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const CallView = ({ active, expanded }: { active: ActiveCall; expanded: boolean }) => {
  const { channels } = useChannels();
  const { me, nameOf } = useChatNames();
  const channel = channels.find((candidate) => candidate.id === active.channelId);
  const call = useCall(active.channelId);
  const { declinedBy } = useCallStore();
  const toast = useToast();
  const now = useNow();
  const connection = useConnectionState();
  const remote = useRemoteParticipants();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Whoever came since joining counts as having answered, even after they hung up again.
  const answered = useRef(new Set<string>());
  for (const participant of remote) answered.current.add(participant.identity);
  const others = channel?.members.filter((id) => id !== me) ?? [];
  const state = callerState({
    kind: channel?.kind ?? "channel",
    others,
    joined: [...answered.current],
    declinedBy: declinedBy[active.channelId] ?? [],
    ringingFor: now.getTime() - active.joinedAt,
  });

  const ringing = state === "ringing" && connection === ConnectionState.Connected;
  useEffect(() => (ringing ? startRinging(0.04) : undefined), [ringing]);
  const ending = state === "declined" || state === "unanswered";
  useEffect(() => {
    if (!ending) return;
    const timer = setTimeout(leaveCall, ENDING_MS);
    return () => clearTimeout(timer);
  }, [ending]);
  // A direct call ends for me when the other side hung up.
  const alone = state === "talking" && channel?.kind === "direct" && remote.length === 0;
  useEffect(() => {
    if (alone && answered.current.size > 0) leaveCall();
  }, [alone]);

  const status =
    connection !== ConnectionState.Connected
      ? m.call_connecting()
      : state === "ringing"
        ? m.call_ringing({ name: firstNameList(others, nameOf) })
        : state === "declined"
          ? m.call_declined()
          : state === "unanswered"
            ? m.call_unanswered()
            : call
              ? callDuration(call.startedAt, now)
              : "";

  return (
    <>
      <p
        role="status"
        className="m-0 shrink-0 text-center font-mono text-[12px] text-muted tabular-nums"
      >
        {status}
      </p>
      <CallTiles
        tracks={tracks}
        expanded={expanded}
        nameOf={(participant) => nameOf(participant.identity)}
      />
      {canPlayAudio ? null : (
        <button
          type="button"
          onClick={() => void startAudio()}
          className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-[13px] text-onprimary"
        >
          <Volume2 size={14} />
          {m.call_play_audio()}
        </button>
      )}
      <CallControls
        onLeave={leaveCall}
        onDeviceError={() => toast.show(m.call_no_device(), "error")}
      />
      <RoomAudioRenderer />
    </>
  );
};

export const CallPanel = ({ active, title }: { active: ActiveCall; title: string }) => {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  return (
    <LiveKitRoom
      serverUrl={active.url}
      token={active.token}
      connect
      audio
      video={active.video}
      onDisconnected={leaveCall}
      onError={() => toast.show(m.call_failed(), "error")}
      onMediaDeviceFailure={() => toast.show(m.call_no_device(), "error")}
      aria-label={m.call_panel({ name: title })}
      role="region"
      className={cn(
        "fixed z-50 flex flex-col gap-3 border-border bg-bg p-3 shadow-2xl",
        "inset-0 safe-top safe-bottom",
        expanded
          ? "md:inset-4 md:rounded-2xl md:border"
          : "md:inset-auto md:right-4 md:bottom-4 md:h-[380px] md:w-[400px] md:rounded-2xl md:border",
      )}
    >
      <header className="flex shrink-0 items-center gap-2">
        <h2 className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={expanded ? m.call_shrink() : m.call_expand()}
          title={expanded ? m.call_shrink() : m.call_expand()}
          onClick={() => setExpanded((value) => !value)}
          className="hidden size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg md:flex"
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </header>
      <CallView active={active} expanded={expanded} />
    </LiveKitRoom>
  );
};
