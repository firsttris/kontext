/**
 * Inside a meeting by link (loaded only on joining): everyone's tiles across the page, the
 * buttons below. Colleagues and guests see the same; guests are marked as such.
 */
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Volume2 } from "lucide-react";
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { holdMicrophone } from "@/lib/audio-session";
import { m } from "@/paraglide/messages";
import { CallControls } from "./call-controls";
import { CallTiles, type NameOf } from "./call-tiles";

const GUEST = /^guest-/;

const nameOf: NameOf = (participant) => {
  const name = participant.name || participant.identity;
  return GUEST.test(participant.identity) ? m.meeting_guest({ name }) : name;
};

const Room = ({ onLeave }: { onLeave: () => void }) => {
  const toast = useToast();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <>
      <CallTiles tracks={tracks} expanded nameOf={nameOf} />
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
        onLeave={onLeave}
        onDeviceError={() => toast.show(m.call_no_device(), "error")}
      />
      <RoomAudioRenderer />
    </>
  );
};

export const MeetingRoom = ({
  url,
  token,
  onLeave,
}: {
  url: string;
  token: string;
  onLeave: () => void;
}) => {
  const toast = useToast();
  // A voice message played during the call must not take the microphone's session.
  useEffect(() => holdMicrophone(), []);
  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      onDisconnected={onLeave}
      onError={() => toast.show(m.call_failed(), "error")}
      onMediaDeviceFailure={() => toast.show(m.call_no_device(), "error")}
      aria-label={m.meeting_title()}
      role="region"
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <Room onLeave={onLeave} />
    </LiveKitRoom>
  );
};
