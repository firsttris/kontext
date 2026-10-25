/**
 * Searching the chat: messages in all channels one sees, the latest first; a hit leads to the
 * message in its channel.
 */
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue } from "react";
import { Highlighted } from "@/components/highlighted";
import { firstName, shortTime, snippet } from "@/lib/chat";
import { messageSummary } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useChannels, useChatSearch } from "./queries";
import { useChatNames } from "./use-chat-names";

export const ChatSearchField = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <label
    className={cn(
      "flex items-center gap-2 rounded-[10px] bg-subtle px-3 text-muted focus-within:ring-1 focus-within:ring-border",
      className,
    )}
  >
    <Search size={15} aria-hidden="true" />
    <span className="sr-only">{m.chat_search()}</span>
    <input
      type="search"
      value={value}
      placeholder={m.chat_search()}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.key === "Escape" && onChange("")}
      className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none"
    />
  </label>
);

export const ChatSearchResults = ({ words, onPick }: { words: string; onPick?: () => void }) => {
  const query = useDeferredValue(words.trim());
  const { data: hits = [], isFetching } = useChatSearch(query);
  const { channels } = useChannels();
  const { nameOf, titleOf } = useChatNames();
  const terms = [query];
  if (query.length < 2) {
    return <p className="m-0 px-2.5 py-3 text-[13px] text-muted">{m.chat_search_more()}</p>;
  }
  return (
    <ul aria-label={m.chat_search_hits()} className="m-0 flex list-none flex-col gap-px p-0">
      {hits.length === 0 && !isFetching ? (
        <li className="px-2.5 py-3 text-[13px] text-muted">{m.chat_search_none()}</li>
      ) : null}
      {hits.map((message) => {
        const channel = channels.find((c) => c.id === message.channelId);
        const where = channel
          ? `${channel.kind === "channel" || channel.kind === "team" ? "#" : ""}${titleOf(channel)}`
          : "";
        return (
          <li key={message.id}>
            <Link
              to="/chat"
              search={
                message.parentId
                  ? {
                      channel: message.channelId,
                      message: message.parentId,
                      thread: message.parentId,
                    }
                  : { channel: message.channelId, message: message.id }
              }
              onClick={onPick}
              className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-fg no-underline hover:bg-hover"
            >
              <span className="flex items-baseline gap-2 text-[12px] text-muted">
                <span className="flex-1 truncate">
                  <span className="font-medium text-fg">{firstName(nameOf(message.authorId))}</span>
                  {where ? ` · ${where}` : ""}
                </span>
                <span className="font-mono">{shortTime(message.createdAt)}</span>
              </span>
              <span className="line-clamp-2 text-[13px]">
                <Highlighted text={snippet(messageSummary(message), query)} terms={terms} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
