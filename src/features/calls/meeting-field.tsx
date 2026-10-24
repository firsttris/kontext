/**
 * The video meeting of a calendar event in its editor: add a link (it also goes into the notes,
 * for guests whose mail program does not show online places), copy it, or take it away again.
 */
import { Copy, Video, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addMeetingNote, removeMeetingNote } from "@/lib/event-form";
import { m } from "@/paraglide/messages";
import { createMeeting, useCalls } from "./queries";

type Props = {
  meeting: string;
  description: string;
  onChange: (meeting: string, description: string) => void;
};

export const MeetingField = ({ meeting, description, onChange }: Props) => {
  const { enabled } = useCalls();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!enabled && !meeting) return null;

  if (!meeting) {
    const add = async () => {
      setBusy(true);
      try {
        const url = await createMeeting();
        onChange(url, addMeetingNote(description, url));
      } catch (error) {
        toast.show(m.common_error({ message: (error as Error).message }), "error");
      } finally {
        setBusy(false);
      }
    };
    return (
      <Button className="self-start" disabled={busy} onClick={() => void add()}>
        <Video size={15} />
        {m.meeting_add()}
      </Button>
    );
  }

  const copy = async () => {
    await navigator.clipboard?.writeText(meeting).catch(() => undefined);
    toast.show(m.meeting_copied());
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
      <Video size={15} aria-hidden="true" className="shrink-0 text-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{m.meeting_label()}</span>
        <span className="truncate font-mono text-[12px] text-muted">{meeting}</span>
      </span>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.meeting_copy()}
        title={m.meeting_copy()}
        onClick={() => void copy()}
      >
        <Copy size={15} />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.meeting_remove()}
        title={m.meeting_remove()}
        onClick={() => onChange("", removeMeetingNote(description, meeting))}
      >
        <X size={15} />
      </Button>
    </div>
  );
};
