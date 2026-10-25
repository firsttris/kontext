/**
 * A call coming in: who calls, with or without camera, and answer or say no. It rings until one
 * decides, the caller gives up, or someone answers on another device.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useChannels } from "@/features/chat/queries";
import { useChatNames } from "@/features/chat/use-chat-names";
import { ringingCall } from "@/lib/calls";
import { m } from "@/paraglide/messages";
import { declineHere, useCallStore } from "./call-store";
import { declineCall, joinCall, joinFailure, useCalls } from "./queries";
import { startRinging } from "./ringtone";

export const IncomingCall = () => {
  const { calls } = useCalls();
  const { channels } = useChannels();
  const { me, nameOf } = useChatNames();
  const { active, declined } = useCallStore();
  const toast = useToast();
  const [answering, setAnswering] = useState(false);
  // While in a call another one does not ring over it; it can be joined from the chat.
  const call = active ? null : ringingCall(calls, channels, me, declined);

  const ringing = Boolean(call);
  useEffect(() => (ringing ? startRinging() : undefined), [ringing]);

  if (!call) return null;
  const caller = nameOf(call.startedBy);
  const answer = async (video: boolean) => {
    setAnswering(true);
    try {
      await joinCall(call.channelId, video);
    } catch (error) {
      toast.show(joinFailure(error), "error");
    } finally {
      setAnswering(false);
    }
  };
  const decline = () => {
    declineHere(call.channelId);
    void declineCall(call.channelId);
  };

  return (
    // Not modal: one can finish a sentence before answering; Escape says no.
    <DialogPrimitive.Root
      modal={false}
      open
      onOpenChange={(open) => (open ? undefined : decline())}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-x-3 top-3 z-[70] flex flex-col gap-4 rounded-2xl border border-border bg-bg p-4 shadow-2xl outline-none safe-top md:inset-x-auto md:top-4 md:right-4 md:w-[340px]"
        >
          <div className="flex items-center gap-3">
            <Avatar name={caller} size={44} className="animate-pulse" />
            <div className="flex min-w-0 flex-col">
              <DialogPrimitive.Title className="m-0 truncate text-[15px] font-semibold">
                {m.call_incoming({ name: caller })}
              </DialogPrimitive.Title>
              <span className="text-[13px] text-muted">
                {call.video ? m.call_incoming_video() : m.call_incoming_audio()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" onClick={decline} disabled={answering}>
              <PhoneOff size={15} />
              {m.call_decline()}
            </Button>
            <Button
              className="flex-1 border-ok text-ok"
              onClick={() => void answer(false)}
              disabled={answering}
            >
              <Phone size={15} />
              {m.call_answer()}
            </Button>
            {call.video ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.call_answer_video()}
                title={m.call_answer_video()}
                onClick={() => void answer(true)}
                disabled={answering}
              >
                <Video size={16} />
              </Button>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
