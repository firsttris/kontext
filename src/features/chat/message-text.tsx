/**
 * A message's text: line breaks kept, links clickable, mentions highlighted (the own one more).
 * Reads the same in both bubbles (`--bubble`, `--bubble-own`): the ink keeps 4.5:1 on either.
 */

import { type Message, type Person, segments } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export const MessageText = ({
  message,
  people,
  me,
}: {
  message: Message;
  people: Person[];
  me: string;
}) => {
  const mentioned = people.filter((person) => message.mentions.includes(person.id));
  return (
    <p className="m-0 text-[15px] leading-[1.5] break-words whitespace-pre-wrap md:text-[14px]">
      {segments(message.text, mentioned).map((part, index) => {
        const key = `${index}-${part.kind}`;
        if (part.kind === "link") {
          return (
            <a
              key={key}
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-ink hover:underline"
            >
              {part.text}
            </a>
          );
        }
        if (part.kind === "mention") {
          return (
            <span
              key={key}
              className={cn(
                "rounded px-0.5 font-medium",
                part.id === me ? "bg-accent-fill text-white" : "bg-accent/10 text-accent-ink",
              )}
            >
              {part.text}
            </span>
          );
        }
        return <span key={key}>{part.text}</span>;
      })}
      {message.editedAt ? <span className="text-[11px] text-muted"> {m.chat_edited()}</span> : null}
    </p>
  );
};
