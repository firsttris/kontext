/**
 * The people in a call as tiles: their camera, else their initials; a ring while they speak and a
 * crossed-out microphone while they are muted. A shared screen comes first and largest.
 */
import {
  type TrackReferenceOrPlaceholder,
  useIsMuted,
  useIsSpeaking,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MicOff, MonitorUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

/** How a tile names someone: as the chat does for colleagues, by their given name for guests. */
export type NameOf = (participant: { identity: string; name?: string }) => string;

const hasVideo = (trackRef: TrackReferenceOrPlaceholder) =>
  Boolean(trackRef.publication?.track) && !trackRef.publication?.isMuted;

const Tile = ({
  trackRef,
  large,
  nameOf,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  large: boolean;
  nameOf: NameOf;
}) => {
  const { participant } = trackRef;
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const screen = trackRef.source === Track.Source.ScreenShare;
  const fullName = nameOf(participant);
  const name = participant.isLocal ? m.call_you() : fullName;
  return (
    <li
      aria-label={micMuted ? `${name}, ${m.call_muted()}` : name}
      className={cn(
        "relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-subtle ring-2 transition-shadow",
        speaking && !screen ? "ring-ok" : "ring-transparent",
        large ? "col-span-full aspect-video" : "aspect-video",
      )}
    >
      {hasVideo(trackRef) && trackRef.publication ? (
        <VideoTrack
          trackRef={{ ...trackRef, publication: trackRef.publication }}
          className={cn(
            "size-full",
            screen ? "object-contain" : "object-cover",
            // One's own camera as in a mirror.
            participant.isLocal && !screen && "-scale-x-100",
          )}
        />
      ) : (
        <Avatar name={fullName} size={large ? 72 : 48} />
      )}
      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
        {screen ? <MonitorUp size={11} aria-hidden="true" /> : null}
        <span className="truncate">{name}</span>
        {micMuted && !screen ? <MicOff size={11} aria-hidden="true" /> : null}
      </span>
    </li>
  );
};

export const CallTiles = ({
  tracks,
  expanded,
  nameOf,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  expanded: boolean;
  nameOf: NameOf;
}) => {
  const screens = tracks.filter((trackRef) => trackRef.source === Track.Source.ScreenShare);
  const cameras = tracks.filter((trackRef) => trackRef.source !== Track.Source.ScreenShare);
  const columns = cameras.length <= 1 ? 1 : cameras.length <= 4 || !expanded ? 2 : 3;
  return (
    <ul
      className="m-0 grid min-h-0 flex-1 list-none content-center gap-2 overflow-y-auto p-0"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {[...screens, ...cameras].map((trackRef) => (
        <Tile
          key={`${trackRef.participant.identity}-${trackRef.source}`}
          trackRef={trackRef}
          large={trackRef.source === Track.Source.ScreenShare}
          nameOf={nameOf}
        />
      ))}
    </ul>
  );
};
