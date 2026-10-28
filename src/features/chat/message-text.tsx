/**
 * A message's text: line breaks kept, links clickable, mentions highlighted (the own one more).
 * `own`: in the dark bubble of one's own message on a phone.
 */

import { type Message, type Person, segments } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export const MessageText = ({
  message,
  people,
  me,
  own = false,
}: {
  message: Message;
  people: Person[];
  me: string;
  own?: boolean;
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
              className={cn(
                "hover:underline",
                own ? "text-onprimary underline md:text-accent md:no-underline" : "text-accent",
              )}
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
                "rounded font-medium",
                !(own && part.id !== me) && "px-0.5",
                part.id === me
                  ? "bg-accent-fill text-white"
                  : own
                    ? "font-semibold md:bg-accent/10 md:font-medium md:text-accent-ink"
                    : "bg-accent/10 text-accent-ink",
              )}
            >
              {part.text}
            </span>
          );
        }
        return <span key={key}>{part.text}</span>;
      })}
      {message.editedAt ? (
        <span className="text-[11px] opacity-70 md:text-muted md:opacity-100">
          {" "}
          {m.chat_edited()}
        </span>
      ) : null}
    </p>
  );
};
