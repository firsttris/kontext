/**
 * Above an answer that also stands in the channel ("Auch im Kanal zeigen"): which message it
 * answers, as a link into that thread. In a confidential channel the first message is opened
 * here first, so the line shows its text, not the ciphertext.
 */
import { CornerDownRight } from "lucide-react";
import type { Message } from "@/lib/chat";
import { messageSummary } from "@/lib/chat-cards";
import { m } from "@/paraglide/messages";
import { useOpened } from "./confidential";

const Summary = ({ parent }: { parent: Message }) => {
  const shown = useOpened(parent);
  const line = shown.deleted ? m.chat_message_deleted() : messageSummary(shown).split("\n")[0]!;
  return <>{m.chat_reply_from_thread({ summary: line })}</>;
};

export const ThreadNote = ({ parent, onOpen }: { parent?: Message; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    title={m.chat_open_thread_of()}
    className="flex max-w-full items-center gap-1.5 text-left text-[12px] text-muted hover:text-fg"
  >
    <CornerDownRight size={13} aria-hidden="true" className="shrink-0" />
    <span className="truncate">
      {parent ? <Summary parent={parent} /> : m.chat_reply_in_a_thread()}
    </span>
  </button>
);
