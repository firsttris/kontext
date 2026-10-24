/**
 * The call buttons in a conversation's header: call or video call in a direct conversation, a
 * meeting in a channel – and "Beitreten" while a call runs there without oneself.
 */
import { Phone, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ChannelSummary } from "@/lib/chat";
import { m } from "@/paraglide/messages";
import { useCallStore } from "./call-store";
import { joinCall, useCall, useCalls } from "./queries";

export const CallButtons = ({ channel }: { channel: ChannelSummary }) => {
  const { enabled } = useCalls();
  const call = useCall(channel.id);
  const { active } = useCallStore();
  const toast = useToast();
  const [joining, setJoining] = useState(false);
  if (!enabled) return null;

  const here = active?.channelId === channel.id;
  const start = async (video: boolean) => {
    if (active && !here) {
      toast.show(m.call_other_active(), "error");
      return;
    }
    setJoining(true);
    try {
      await joinCall(channel.id, video);
    } catch {
      toast.show(m.call_failed(), "error");
    } finally {
      setJoining(false);
    }
  };

  if (call && !here) {
    return (
      <Button
        size="sm"
        className="border-ok text-ok"
        disabled={joining}
        onClick={() => void start(call.video)}
        title={m.call_running({ count: call.participants.length })}
      >
        <Phone size={14} />
        {m.call_join()}
        <span className="font-mono text-[11px]">{call.participants.length}</span>
      </Button>
    );
  }

  const direct = channel.kind === "direct";
  const audioLabel = direct ? m.call_audio() : m.call_meeting();
  const videoLabel = direct ? m.call_video() : m.call_meeting_video();
  return (
    <>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={audioLabel}
        title={audioLabel}
        disabled={joining || here}
        onClick={() => void start(false)}
      >
        <Phone size={16} />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={videoLabel}
        title={videoLabel}
        disabled={joining || here}
        onClick={() => void start(true)}
      >
        <Video size={16} />
      </Button>
    </>
  );
};
