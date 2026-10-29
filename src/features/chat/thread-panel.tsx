/**
 * The thread of a message: the message, its answers and a field to answer – beside the
 * conversation on a wide screen, instead of it on a phone. Answers stay out of the channel;
 * who wrote in the thread hears of new ones.
 */
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useLayoutEffect } from "react";
import { useMediaQuery } from "@/components/use-media-query";
import { type ChannelSummary, firstName, type Message, timeline } from "@/lib/chat";
import { m } from "@/paraglide/messages";
import { useUnlockedKey } from "../pgp/queries";
import { ConfidentialUnlock, useSeal } from "./confidential";
import { MessageInput } from "./message-input";
import { Run } from "./message-run";
import { isPending, useChatActions } from "./queries";
import { useReact, useThread } from "./thread-queries";
import { useAttachments } from "./use-attachments";
import { useChatNames } from "./use-chat-names";
import { useScrollPlace } from "./use-scroll-place";

export const ThreadPanel = ({
  channel,
  parentId,
  title,
  onClose,
  onMakeTask,
}: {
  channel: ChannelSummary;
  parentId: string;
  /** "#lager", "info@weber-haustechnik.test", the colleague's name. */
  title: string;
  onClose: () => void;
  onMakeTask: (message: Message) => void;
}) => {
  const { me, people, nameOf } = useChatNames();
  const { thread, isError } = useThread(parentId);
  const actions = useChatActions(me);
  const react = useReact(me);
  const seal = useSeal(channel);
  const attachments = useAttachments(channel.id, { seal });
  const unlocked = useUnlockedKey();
  const replies = thread?.replies ?? [];

  // Opened: read up to its newest answer, so the channel shows no "neu" on it any more.
  const newest = replies.filter((reply) => !isPending(reply)).at(-1);
  const markRead = actions.markRead.mutate;
  useEffect(() => {
    if (!newest || (channel.readAt && channel.readAt >= newest.createdAt)) return;
    markRead({ channelId: channel.id, at: newest.createdAt });
  }, [newest, channel.id, channel.readAt, markRead]);

  // Down to the newest answer; on a phone without the keyboard, which would cover the thread
  // just opened (it comes with a tap into the field).
  const { toBottom, scroller, scrollProps } = useScrollPlace();
  useLayoutEffect(() => {
    if (replies.length) toBottom();
  }, [replies.length, toBottom]);
  const desktop = useMediaQuery("(min-width: 768px)");

  const shared = {
    me,
    people,
    nameOf,
    onMakeTask,
    onReact: react,
    onEdit: (message: Message, text: string, mentions: string[]) =>
      actions.edit.mutate({
        id: message.id,
        channelId: message.channelId,
        text,
        mentions,
        files: message.files,
      }),
    onDelete: (message: Message) => {
      if (window.confirm(m.chat_delete_message_confirm())) actions.remove.mutate(message.id);
    },
  };
  const mentionable =
    channel.kind === "channel" || channel.kind === "direct"
      ? people.filter((person) => channel.members.includes(person.id))
      : people;

  return (
    <aside
      aria-label={m.chat_thread()}
      className="flex h-full min-h-0 w-full flex-col border-border bg-bg lg:w-[400px] lg:shrink-0 lg:border-l"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 md:px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label={m.chat_thread_back()}
          className="flex size-11 items-center justify-center text-fg lg:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="m-0 text-[16px] font-semibold">{m.chat_thread()}</h2>
          <span className="truncate text-[12px] text-muted">{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={m.chat_close()}
          className="hidden size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg lg:flex"
        >
          <X size={16} />
        </button>
      </header>
      <div
        ref={scroller}
        {...scrollProps}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 md:px-5"
      >
        {isError ? (
          <p className="m-0 py-10 text-center text-[14px] text-muted">{m.chat_thread_gone()}</p>
        ) : null}
        {thread ? (
          <ol
            aria-label={m.chat_thread_messages()}
            className="m-0 flex list-none flex-col gap-3 p-0"
          >
            <Run
              run={{
                authorId: thread.message.authorId,
                createdAt: thread.message.createdAt,
                messages: [thread.message],
              }}
              {...shared}
            />
            <li className="flex items-center gap-2.5 text-[12px] text-muted after:h-px after:flex-1 after:bg-border">
              {replies.length === 1
                ? m.chat_replies_one()
                : m.chat_replies({ count: replies.length })}
            </li>
            {timeline(replies, new Date())
              .filter((item) => item.kind === "run")
              .map((item) => (
                <Run key={item.messages[0]!.id} run={item} {...shared} />
              ))}
          </ol>
        ) : null}
      </div>
      <div className="shrink-0 px-2.5 pt-2 pb-3 safe-bottom md:px-4 md:pb-4">
        {channel.confidential && !unlocked ? (
          <ConfidentialUnlock />
        ) : (
          <MessageInput
            key={parentId}
            placeholder={
              !thread || thread.message.authorId === me
                ? m.chat_reply_placeholder_own()
                : m.chat_reply_placeholder({ name: firstName(nameOf(thread.message.authorId)) })
            }
            people={mentionable}
            me={me}
            autoFocus={desktop}
            onTyping={() => undefined}
            attachments={attachments}
            cards={!channel.confidential}
            onSend={(text, mentions) => {
              actions.post.mutate({
                channelId: channel.id,
                parentId,
                text,
                mentions,
                cards: attachments.cards,
                files: attachments.files.flatMap((file) => (file.uploaded ? [file.uploaded] : [])),
              });
              attachments.clear();
            }}
          />
        )}
      </div>
    </aside>
  );
};
