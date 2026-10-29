/**
 * The people in a call as tiles: their camera, else their initials; a ring while they speak and a
 * crossed-out microphone while they are muted. How they share the space: lib/call-layout.ts.
 */
import {
  type TrackReferenceOrPlaceholder,
  useIsMuted,
  useIsSpeaking,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MicOff, MonitorUp } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { arrangeTiles, gridColumns } from "@/lib/call-layout";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

/** How a tile names someone: as the chat does for colleagues, by their given name for guests. */
export type NameOf = (participant: { identity: string; name?: string }) => string;
/** A colleague's photo; none for a meeting's guests, who see no one's. */
export type PhotoOf = (participant: { identity: string }) => string | undefined;

type Names = { nameOf: NameOf; photoOf?: PhotoOf };

const hasVideo = (trackRef: TrackReferenceOrPlaceholder) =>
  Boolean(trackRef.publication?.track) && !trackRef.publication?.isMuted;

const isScreen = (trackRef: TrackReferenceOrPlaceholder) =>
  trackRef.source === Track.Source.ScreenShare;

const keyOf = (trackRef: TrackReferenceOrPlaceholder) =>
  `${trackRef.participant.identity}-${trackRef.source}`;

const Tile = ({
  trackRef,
  avatarSize,
  className,
  nameOf,
  photoOf,
}: Names & { trackRef: TrackReferenceOrPlaceholder; avatarSize: number; className: string }) => {
  const { participant } = trackRef;
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const screen = isScreen(trackRef);
  const fullName = nameOf(participant);
  const name = participant.isLocal ? m.call_you() : fullName;
  return (
    <li
      aria-label={micMuted ? `${name}, ${m.call_muted()}` : name}
      className={cn(
        "flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-subtle ring-2 transition-shadow",
        speaking && !screen ? "ring-ok" : "ring-transparent",
        className,
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
        <Avatar name={fullName} photo={photoOf?.(participant)} size={avatarSize} />
      )}
      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
        {screen ? <MonitorUp size={11} aria-hidden="true" /> : null}
        <span className="truncate">{name}</span>
        {micMuted && !screen ? <MicOff size={11} aria-hidden="true" /> : null}
      </span>
    </li>
  );
};

/** The width and height an element has on screen, kept up to date. */
const useSize = (ref: RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

const Grid = ({ tracks, ...names }: Names & { tracks: TrackReferenceOrPlaceholder[] }) => {
  const ref = useRef<HTMLUListElement>(null);
  const { width, height } = useSize(ref);
  const columns = gridColumns(tracks.length, width, height);
  const rows = Math.ceil(tracks.length / columns);
  return (
    <ul
      ref={ref}
      className="m-0 grid min-h-0 flex-1 list-none gap-2 overflow-y-auto p-0"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        // The cells share the height; past a few rows they scroll rather than shrink to nothing.
        gridTemplateRows: `repeat(${rows}, minmax(96px, 1fr))`,
      }}
    >
      {tracks.map((trackRef) => (
        <Tile
          key={keyOf(trackRef)}
          trackRef={trackRef}
          avatarSize={tracks.length <= 2 ? 72 : 48}
          className="relative"
          {...names}
        />
      ))}
    </ul>
  );
};

const Stage = ({
  main,
  inset,
  strip,
  ...names
}: Names & {
  main: TrackReferenceOrPlaceholder;
  inset: TrackReferenceOrPlaceholder | null;
  strip: TrackReferenceOrPlaceholder[];
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-2">
    <ul className="relative m-0 flex min-h-0 flex-1 list-none p-0">
      <Tile trackRef={main} avatarSize={72} className="relative flex-1" {...names} />
      {inset ? (
        <Tile
          key={keyOf(inset)}
          trackRef={inset}
          avatarSize={32}
          className="absolute right-2 bottom-2 aspect-[3/4] w-[30%] max-w-40 shadow-lg md:aspect-video md:max-w-52"
          {...names}
        />
      ) : null}
    </ul>
    {strip.length > 0 ? (
      <ul className="m-0 flex h-20 shrink-0 list-none gap-2 overflow-x-auto p-0">
        {strip.map((trackRef) => (
          <Tile
            key={keyOf(trackRef)}
            trackRef={trackRef}
            avatarSize={32}
            className="relative aspect-video h-full shrink-0"
            {...names}
          />
        ))}
      </ul>
    ) : null}
  </div>
);

export const CallTiles = ({
  tracks,
  ...names
}: Names & { tracks: TrackReferenceOrPlaceholder[] }) => {
  const layout = arrangeTiles(tracks, {
    isScreen,
    isLocal: (trackRef) => trackRef.participant.isLocal,
  });
  return layout.kind === "grid" ? (
    <Grid tracks={layout.tiles} {...names} />
  ) : (
    <Stage main={layout.main} inset={layout.inset} strip={layout.strip} {...names} />
  );
};
