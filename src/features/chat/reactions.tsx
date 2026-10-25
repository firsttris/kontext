/**
 * Emojis on a message: the chips under it (count, mine marked, who in the tooltip; a click adds or
 * takes away one's own) and the button with the quick choices.
 */
import * as Popover from "@radix-ui/react-popover";
import { SmilePlus } from "lucide-react";
import { useState } from "react";
import type { Message } from "@/lib/chat";
import { QUICK_REACTIONS, reactionNames } from "@/lib/chat-threads";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export const ReactionPicker = ({
  onPick,
  className,
}: {
  onPick: (emoji: string) => void;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={m.chat_react()} title={m.chat_react()} className={className}>
        <SmilePlus size={15} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          aria-label={m.chat_react()}
          className="z-50 flex gap-0.5 rounded-full border border-border bg-bg p-1 shadow-lg"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={m.chat_react_with({ emoji })}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="flex size-9 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-125 hover:bg-hover"
            >
              {emoji}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export const ReactionBar = ({
  message,
  me,
  nameOf,
  onReact,
}: {
  message: Message;
  me: string;
  nameOf: (id: string) => string;
  onReact: (emoji: string) => void;
}) =>
  message.reactions.length ? (
    <ul aria-label={m.chat_reactions()} className="m-0 flex list-none flex-wrap gap-1 p-0">
      {message.reactions.map((reaction) => {
        const mine = reaction.members.includes(me);
        const who = reactionNames(reaction, me, nameOf);
        return (
          <li key={reaction.emoji}>
            <button
              type="button"
              aria-pressed={mine}
              aria-label={m.chat_reaction_label({
                emoji: reaction.emoji,
                count: reaction.members.length,
                names: who,
              })}
              title={`${who}: ${reaction.emoji}`}
              onClick={() => onReact(reaction.emoji)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full border px-2 text-[13px] transition-colors",
                mine
                  ? "border-accent/60 bg-accent/10 font-medium text-accent"
                  : "border-border bg-bg text-muted hover:border-muted hover:text-fg",
              )}
            >
              <span className="text-[15px] leading-none">{reaction.emoji}</span>
              <span className="font-mono text-[12px]">{reaction.members.length}</span>
            </button>
          </li>
        );
      })}
      <li>
        <ReactionPicker
          onPick={onReact}
          className="flex h-7 items-center rounded-full border border-dashed border-border px-2 text-muted hover:border-muted hover:text-fg"
        />
      </li>
    </ul>
  ) : null;
