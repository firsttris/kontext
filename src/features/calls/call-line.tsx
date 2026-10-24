/**
 * An ended call in the conversation: what kind, how long, or missed – with "Zurückrufen" for a
 * missed direct call (the caller reads "Keine Antwort" and can try again).
 */
import { Phone, PhoneMissed, Users, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type CallRecord, callLine } from "@/lib/calls";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useCallStore } from "./call-store";
import { joinCall, useCalls } from "./queries";

const iconOf = (call: CallRecord) =>
  call.durationS === null ? PhoneMissed : call.meeting ? Users : call.video ? Video : Phone;

export const CallLine = ({
  call,
  channelId,
  own,
}: {
  call: CallRecord;
  channelId: string;
  /** I made the call. */
  own: boolean;
}) => {
  const { enabled } = useCalls();
  const { active } = useCallStore();
  const toast = useToast();
  const [calling, setCalling] = useState(false);
  const Icon = iconOf(call);
  const missed = call.durationS === null;
  const callBack = async () => {
    setCalling(true);
    try {
      await joinCall(channelId, call.video);
    } catch {
      toast.show(m.call_failed(), "error");
    } finally {
      setCalling(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[14px]">
      <Icon size={15} aria-hidden="true" className={cn(missed ? "text-danger" : "text-muted")} />
      <span className={cn(missed && "text-danger")}>
        {missed && own ? m.call_unanswered() : callLine(call)}
      </span>
      {missed && !call.meeting && enabled && !active ? (
        <Button size="sm" variant="ghost" disabled={calling} onClick={() => void callBack()}>
          {own ? m.call_again() : m.call_back()}
        </Button>
      ) : null}
    </div>
  );
};
