/** While a voice message is recorded: how long so far, throw it away or send it. */
import { SendHorizontal, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration, MAX_VOICE_SECONDS } from "@/lib/voice";
import { m } from "@/paraglide/messages";

export const VoiceRecorderBar = ({
  seconds,
  onDiscard,
  onSend,
}: {
  seconds: number;
  onDiscard: () => void;
  onSend: () => void;
}) => {
  // At the limit the recording goes as it is.
  useEffect(() => {
    if (seconds >= MAX_VOICE_SECONDS) onSend();
  }, [seconds, onSend]);

  return (
    <fieldset
      aria-label={m.chat_voice_recording()}
      className="m-0 flex min-h-11 min-w-0 items-center gap-1.5 border-0 p-0 md:min-h-[52px] md:px-2"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.chat_voice_discard()}
        title={m.chat_voice_discard()}
        onClick={onDiscard}
      >
        <Trash2 size={18} />
      </Button>
      <span className="flex flex-1 items-center gap-2 px-1 text-[15px]">
        <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
        <span role="timer" className="tabular-nums">
          {formatDuration(seconds)}
        </span>
        <span className="truncate text-muted">{m.chat_voice_recording()}</span>
      </span>
      <Button
        variant="primary"
        aria-label={m.chat_voice_send()}
        onClick={onSend}
        className="size-11 rounded-full p-0 md:h-8 md:w-auto md:rounded-lg md:px-3.5"
      >
        <SendHorizontal size={17} className="md:hidden" />
        <span className="hidden md:inline">{m.chat_send()}</span>
      </Button>
    </fieldset>
  );
};
