/** In a mail: where it was discussed in the chat, with the answers since – a link to the place. */
import { Link } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { m } from "@/paraglide/messages";
import { useChannels, useDiscussions } from "./queries";
import { useChatNames } from "./use-chat-names";

export const DiscussedNotice = ({
  emailId,
  threadId,
}: {
  emailId: string;
  threadId: string | null;
}) => {
  const discussions = useDiscussions(emailId, threadId);
  const { channels } = useChannels();
  const { titleOf } = useChatNames();
  // The latest per channel.
  const latest = discussions.filter(
    (discussion, index) =>
      discussions.findIndex((d) => d.channelId === discussion.channelId) === index,
  );
  return latest.map((discussion) => {
    const channel = channels.find((c) => c.id === discussion.channelId);
    if (!channel) return null;
    const name = `${channel.kind === "channel" || channel.kind === "team" ? "#" : ""}${titleOf(channel)}`;
    return (
      <Link
        key={discussion.channelId}
        to="/chat"
        search={{ channel: discussion.channelId, message: discussion.messageId }}
        className="-mt-1 flex items-center gap-2 self-start rounded-lg border border-border px-2.5 py-1.5 text-[13px] text-fg no-underline hover:bg-hover"
      >
        <MessagesSquare size={14} className="text-accent" aria-hidden="true" />
        {m.chat_discussed_in({ name })}
        {discussion.replies > 0 ? (
          <span className="text-muted">
            ·{" "}
            {discussion.replies === 1
              ? m.chat_replies_one()
              : m.chat_replies({ count: discussion.replies })}
          </span>
        ) : null}
      </Link>
    );
  });
};
