/**
 * While a voice message is recorded: how long so far, the waveform growing as one speaks, throw it
 * away or send it. Sent, it stays as it was until the message is in the conversation (`sending`),
 * so the field does not come back empty in between.
 */
import { LoaderCircle, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDuration, MAX_VOICE_SECONDS } from "@/lib/voice";
import { m } from "@/paraglide/messages";
import { LIVE_BARS } from "./use-voice-recorder";

/** Before anything is heard, the bars are dots. */
const QUIET = 0.08;

const LiveWaveform = ({ levels }: { levels: number[] }) => {
  const shown = [...Array.from({ length: LIVE_BARS - levels.length }, () => QUIET), ...levels];
  return (
    <span aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center gap-[2px]">
      {shown.map((level, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: slots of a fixed row, the newest on the right
          key={index}
          className="min-w-[2px] flex-1 rounded-full bg-fg/70 transition-[height] duration-100 ease-out"
          style={{ height: `${Math.round(level * 100)}%` }}
        />
      ))}
    </span>
  );
};

export const VoiceRecorderBar = ({
  seconds,
  levels,
  sending,
  onDiscard,
  onSend,
}: {
  seconds: number;
  levels: number[];
  sending: boolean;
  onDiscard: () => void;
  onSend: () => void;
}) => {
  // At the limit the recording goes as it is.
  useEffect(() => {
    if (!sending && seconds >= MAX_VOICE_SECONDS) onSend();
  }, [sending, seconds, onSend]);

  return (
    <fieldset
      aria-label={m.chat_voice_recording()}
      aria-busy={sending}
      className="m-0 flex min-h-11 min-w-0 items-center gap-1.5 border-0 p-0 md:min-h-[52px] md:px-2"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.chat_voice_discard()}
        title={m.chat_voice_discard()}
        disabled={sending}
        onClick={onDiscard}
      >
        <Trash2 size={18} />
      </Button>
      <span className="flex min-w-0 flex-1 items-center gap-2.5 px-1 text-[15px]">
        <span
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            sending ? "bg-muted" : "animate-pulse bg-danger",
          )}
        />
        <span role="timer" className="shrink-0 tabular-nums">
          {formatDuration(seconds)}
        </span>
        <LiveWaveform levels={levels} />
      </span>
      <Button
        variant="primary"
        aria-label={m.chat_voice_send()}
        disabled={sending}
        onClick={onSend}
        className="size-11 rounded-full p-0 md:h-8 md:w-auto md:rounded-lg md:px-3.5"
      >
        {sending ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <>
            <SendHorizontal size={17} className="md:hidden" />
            <span className="hidden md:inline">{m.chat_send()}</span>
          </>
        )}
      </Button>
    </fieldset>
  );
};
