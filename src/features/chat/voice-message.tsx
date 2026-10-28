/**
 * A voice message in the conversation: play and pause, the waveform (a slider over it: a click,
 * dragging or the arrow keys jump), how long it is, and faster playing. One plays at a time. The length and the waveform come
 * from the decoded audio: a browser's own WebM recording does not say how long it is.
 */
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { setAudioSession, setPlaybackSession } from "@/lib/audio-session";
import type { ChatFile } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { formatDuration, waveform } from "@/lib/voice";
import { m } from "@/paraglide/messages";

const BARS = 36;
const SPEEDS = [1, 1.5, 2];

/** The voice message playing now, paused when another starts. */
let playing: HTMLAudioElement | null = null;

/** Stops the voice message playing now, as a recording starts. */
export const stopVoiceMessage = () => playing?.pause();

export type VoiceShape = { duration: number; bars: number[] };

/** By the file, not its address: a recording just sent already has its shape (use-attachments.ts). */
export const voiceShapeKey = (fileId: string) => ["chat", "voice-shape", fileId];

/** Length and waveform from the audio itself. */
export const decodeVoiceShape = async (bytes: ArrayBuffer): Promise<VoiceShape> => {
  // Decoding needs no speakers: an offline context of one sample is enough.
  const audio = await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(bytes);
  return { duration: audio.duration, bars: waveform(audio.getChannelData(0), BARS) };
};

const useVoiceShape = (fileId: string, url: string | undefined) =>
  useQuery({
    queryKey: voiceShapeKey(fileId),
    queryFn: async () =>
      decodeVoiceShape(await (await fetch(url!, { credentials: "same-origin" })).arrayBuffer()),
    enabled: Boolean(url) && typeof OfflineAudioContext !== "undefined",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

const flat = Array.from({ length: BARS }, () => 0.3);

const Bars = ({
  heights,
  className,
  style,
}: {
  heights: number[];
  className: string;
  style?: CSSProperties;
}) => (
  <div
    aria-hidden="true"
    className="absolute inset-0 flex items-center gap-[2px] overflow-hidden"
    style={style}
  >
    {heights.map((height, index) => (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of bars, never reordered
        key={index}
        className={cn("min-w-[2px] flex-1 rounded-full", className)}
        style={{ height: `${Math.round(height * 100)}%` }}
      />
    ))}
  </div>
);

export const VoiceMessage = ({ file, url }: { file: ChatFile; url: string | undefined }) => {
  const audio = useRef<HTMLAudioElement>(null);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mediaDuration, setMediaDuration] = useState(0);
  const shape = useVoiceShape(file.id, url);
  const duration = shape.data?.duration ?? mediaDuration;
  const bars = shape.data?.bars ?? flat;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // While playing, the position follows every frame: "timeupdate" comes only about four times a
  // second, and the waveform would fill in jumps.
  useEffect(() => {
    if (paused) return;
    let frame = 0;
    const follow = () => {
      if (audio.current) setPosition(audio.current.currentTime);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [paused]);

  useEffect(() => {
    // The ref is empty again by the time a component's effects are cleaned up.
    const element = audio.current;
    return () => {
      if (playing !== element) return;
      playing = null;
      setAudioSession("auto");
    };
  }, []);

  /** The session goes back to the browser, unless another message has started meanwhile. */
  const stopped = (element: HTMLAudioElement) => {
    setPaused(true);
    if (playing === element) setAudioSession("auto");
  };

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (playing && playing !== element) playing.pause();
    playing = element;
    // Set within the tap, before playing starts: otherwise an iPhone plays the first time silent.
    setPlaybackSession();
    element.play().catch(() => stopped(element));
  };

  const seek = (seconds: number) => {
    const element = audio.current;
    if (!element || duration <= 0) return;
    const to = Math.min(duration, Math.max(0, seconds));
    element.currentTime = to;
    setPosition(to);
  };

  return (
    <fieldset
      aria-label={m.chat_voice_message({ duration: formatDuration(duration) })}
      data-voice={file.id}
      className="m-0 flex w-72 max-w-full min-w-0 items-center gap-2.5 rounded-xl border border-border bg-bg py-2 pr-2.5 pl-2"
    >
      <button
        type="button"
        aria-label={paused ? m.chat_voice_play() : m.chat_voice_pause()}
        disabled={!url}
        onClick={toggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-onprimary disabled:opacity-50"
      >
        {paused ? <Play size={16} className="ml-0.5" /> : <Pause size={16} />}
      </button>
      <div className="relative h-8 min-w-0 flex-1">
        <Bars heights={bars} className="bg-border" />
        {/* The played part, the same bars darker, cut off where the voice is now. */}
        <Bars
          heights={bars}
          className="bg-fg"
          style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
        />
        <input
          type="range"
          aria-label={m.chat_voice_position()}
          aria-valuetext={formatDuration(position)}
          min={0}
          max={duration || 1}
          step={0.1}
          value={position}
          disabled={duration <= 0}
          onChange={(event) => seek(Number(event.target.value))}
          className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[12px] text-muted tabular-nums">
        {formatDuration(paused && position === 0 ? duration : position)}
      </span>
      <button
        type="button"
        aria-label={m.chat_voice_speed({ speed: String(speed) })}
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
        className="h-6 shrink-0 rounded-full bg-subtle px-2 text-[11px] font-medium tabular-nums hover:bg-hover"
      >
        {speed}×
      </button>
      {/* biome-ignore lint/a11y/useMediaCaption: a voice message has no captions to give */}
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPaused(false)}
        // Also at the end: a message that has played to its end is paused.
        onPause={(event) => stopped(event.currentTarget)}
        onEnded={() => setPosition(0)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const length = event.currentTarget.duration;
          if (Number.isFinite(length)) setMediaDuration(length);
          event.currentTarget.playbackRate = speed;
        }}
      />
    </fieldset>
  );
};
